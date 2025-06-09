// __tests__/integration/serviceB.integration.test.js
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Set NODE_ENV to 'test' to ensure test database and mock external calls
process.env.NODE_ENV = 'test';

// Define the path for the test database
const TEST_DB_PATH = path.resolve(__dirname, '../../test_serviceB.sqlite');

// Mock axios to prevent actual HTTP calls to Service A during tests
jest.mock('axios');

describe('Integration Test: Service B API Endpoints', () => {
    let app;
    let importedModules; // To hold the dynamically imported modules
    let mockAxiosPost;
    let mockAxiosGet;
    let mockAxiosPut;

    beforeAll(async () => {
        jest.setTimeout(20000); // 20 seconds timeout for the entire test suite

        if (fs.existsSync(TEST_DB_PATH)) {
            console.log(`Attempting to clean up old test database in beforeAll: ${TEST_DB_PATH}`);
            try {
                // Temporarily require index.js to get its closeDb, but don't hold onto it
                const tempLoadedModules = require('../../src/index');
                if (tempLoadedModules.closeDb) {
                    await new Promise(resolve => tempLoadedModules.closeDb(resolve));
                    console.log('Successfully closed a pre-existing DB connection.');
                }
            } catch (err) {
                console.warn(`Could not attempt pre-cleanup DB close: ${err.message}`);
            }

            try {
                fs.unlinkSync(TEST_DB_PATH);
                console.log(`🧹 Cleaned up old test database: ${TEST_DB_PATH}`);
            } catch (err) {
                console.error(`❌ Error cleaning up test database in beforeAll: ${err.message}`);
                throw new Error(`Failed to unlink test DB in beforeAll: ${err.message}. Please ensure no other process is holding the file.`);
            }
        }
    });

    beforeEach(async () => {
        // 1. Clear Node.js module cache for 'index.js'.
        jest.resetModules();

        // 2. Dynamically import the app and modules.
        importedModules = require('../../src/index');
        app = importedModules.app;

        // 3. Explicitly connect to the database for this test's instance.
        // This will set the `currentDb` in index.js to the new connection.
        await importedModules.connectDb();

        // 4. Clear all database tables for test isolation.
        // Now use importedModules.dbRun directly as it uses the currentDb.
        await Promise.all([
            importedModules.dbRun('DELETE FROM reservations'),
            importedModules.dbRun('DELETE FROM promotions'),
            importedModules.dbRun('DELETE FROM service_reviews')
        ]);

        // 5. Reset and define default behaviors for axios mocks.
        mockAxiosPost = axios.post.mockResolvedValue({ data: { success: true } });
        mockAxiosGet = axios.get.mockResolvedValue({ data: [] });
        mockAxiosPut = axios.put.mockResolvedValue({ data: { success: true } });
    });

    afterEach(async () => {
        jest.clearAllMocks();

        // Close the database connection after EACH test using the exported closeDb.
        // This targets the specific `currentDb` instance from this test.
        if (importedModules.db && importedModules.db.open) {
            await new Promise(resolve => importedModules.closeDb(resolve));
            // console.log('Database connection closed after each test.'); // For debugging
        } else {
            // console.warn('DB was not open to close in afterEach.');
        }
    });

    afterAll(async () => {
        // Final server close (if it was ever created and listening)
        if (importedModules.server && importedModules.server.listening) {
            await new Promise(resolve => importedModules.server.close(resolve));
            console.log('Server closed in afterAll.');
        }

        // Final database close. This is a safeguard.
        // It ensures the very last database connection from the last test is closed.
        if (importedModules.db && importedModules.db.open) {
            await new Promise(resolve => importedModules.closeDb(resolve));
            console.log('Final database connection closed in afterAll.');
        }

        // Add a small delay to allow the OS to release the file handle.
        // This is a common workaround for EBUSY on Windows.
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for 100ms

        if (fs.existsSync(TEST_DB_PATH)) {
            try {
                fs.unlinkSync(TEST_DB_PATH);
                console.log(`🗑️ Deleted test database: ${TEST_DB_PATH}`);
            } catch (err) {
                console.error(`❌ Error deleting test database in afterAll: ${err.message}`);
                throw new Error(`Failed to unlink test DB in afterAll: ${err.message}`);
            }
        }
        jest.setTimeout(5000); // Reset Jest's timeout
    });

    // --- Test Suites for Endpoints ---

    describe('Health Endpoints', () => {
        test('GET /health should return 200 and status ok', async () => {
            const res = await request(app).get('/health');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('status', 'ok');
        });

        test('GET /db-health should return 200 and status healthy', async () => {
            const res = await request(app).get('/db-health');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('status', 'healthy');
        });
    });

    describe('Promotion Endpoints', () => {
        test('GET /promotions should return an empty array if no promotions exist', async () => {
            const res = await request(app).get('/promotions');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([]);
        });

        test('POST /promotions should create a new promotion', async () => {
            const newPromotion = {
                name: 'Spring Sale',
                description: 'Enjoy 15% off on all main courses!',
                discount_percentage: 15.0,
                start_date: '2025-03-01',
                end_date: '2025-05-31'
            };
            const res = await request(app).post('/promotions').send(newPromotion);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.name).toBe('Spring Sale');
            expect(res.body.discount_percentage).toBe(15.0);
            expect(res.body.is_active).toBe(1);

            const promotionsInDb = await importedModules.dbGet('SELECT * FROM promotions WHERE id = ?', [res.body.id]);
            expect(promotionsInDb).toBeDefined();
            expect(promotionsInDb.name).toBe('Spring Sale');
        });

        test('GET /promotions should return only active promotions based on date', async () => {
            await importedModules.dbRun(
                `INSERT INTO promotions (id, name, description, discount_percentage, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['p-active-1', 'Active Promo', 'Active one', 25.0, '2025-01-01', '2025-12-31']
            );
            await importedModules.dbRun(
                `INSERT INTO promotions (id, name, description, discount_percentage, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['p-expired-1', 'Expired Promo', 'Expired one', 10.0, '2024-01-01', '2024-12-31']
            );
            await importedModules.dbRun(
                `INSERT INTO promotions (id, name, description, discount_percentage, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['p-future-1', 'Future Promo', 'Future one', 30.0, '2026-01-01', '2026-03-31']
            );

            const res = await request(app).get('/promotions');
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].name).toBe('Active Promo');
            expect(res.body[0].discount_percentage).toBe(25.0);
        });

        test('POST /promotions should return 400 for missing required fields', async () => {
            const res = await request(app).post('/promotions').send({ name: 'Partial Promo' });
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'Missing required fields');
        });
    });

    describe('Reservation Endpoints', () => {
        test('POST /reservation should create a pending reservation and not call Service A', async () => {
            const customerName = 'John Doe';
            const res = await request(app).post('/reservation').send({ customerName });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('status', 'pending');
            expect(mockAxiosPost).not.toHaveBeenCalled();

            const reservationsInDb = await importedModules.dbGet('SELECT * FROM reservations WHERE id = ?', [res.body.reservationId]);
            expect(reservationsInDb).toBeDefined();
            expect(reservationsInDb.customerName).toBe(customerName);
            expect(reservationsInDb.status).toBe('pending');
        });

        test('POST /reservation-status should update an existing reservation status', async () => {
            const reservationId = `reserv-${uuidv4()}`;
            await importedModules.dbRun(
                "INSERT INTO reservations (id, customerName, status) VALUES (?, ?, ?)",
                [reservationId, 'Jane Smith', 'pending']
            );

            const updateData = {
                reservationId,
                status: 'confirmed',
                tableNumber: 'T10',
                message: 'Your table is ready'
            };
            const res = await request(app).post('/reservation-status').send(updateData);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('status', 'success');
            expect(res.body.updatedStatus).toBe('confirmed');

            const updatedReservation = await importedModules.dbGet('SELECT * FROM reservations WHERE id = ?', [reservationId]);
            expect(updatedReservation.status).toBe('confirmed');
            expect(updatedReservation.tableNumber).toBe('T10');
        });

        test('PUT /reservation/:id/cancel should cancel a reservation and not call Service A to release table', async () => {
            const reservationId = `reserv-${uuidv4()}`;
            await importedModules.dbRun(
                "INSERT INTO reservations (id, customerName, status, tableNumber) VALUES (?, ?, ?, ?)",
                [reservationId, 'Alice Wonderland', 'confirmed', 'T5']
            );

            const res = await request(app).put(`/reservation/${reservationId}/cancel`);

            expect(res.statusCode).toEqual(200);
            expect(res.body.status).toBe('cancelled');
            expect(mockAxiosPut).not.toHaveBeenCalled();

            const cancelledReservation = await importedModules.dbGet('SELECT * FROM reservations WHERE id = ?', [reservationId]);
            expect(cancelledReservation.status).toBe('cancelled');
        });

        test('PUT /reservation/:id/cancel should return 404 if reservation not found', async () => {
            const nonExistentId = 'non-existent-reserv-id';
            const res = await request(app).put(`/reservation/${nonExistentId}/cancel`);
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('error', 'Reservation not found');
        });

        test('GET /all-reservations should return all reservations', async () => {
            await importedModules.dbRun("INSERT INTO reservations (id, customerName, status) VALUES (?, ?, ?)", ['res1', 'Cust A', 'pending']);
            await importedModules.dbRun("INSERT INTO reservations (id, customerName, status) VALUES (?, ?, ?)", ['res2', 'Cust B', 'confirmed']);

            const res = await request(app).get('/all-reservations');
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(2);
            expect(res.body[0].customerName).toBe('Cust A');
            expect(res.body[1].customerName).toBe('Cust B');
        });
    });

    describe('Review Endpoints', () => {
        test('POST /review should create a new review and not call Service A', async () => {
            const newReview = {
                customerName: 'Bob',
                comment: 'Great service! Loved the atmosphere.',
                rating: 5
            };
            const res = await request(app).post('/review').send(newReview);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.customerName).toBe('Bob');
            expect(res.body.rating).toBe(5);
            expect(res.body.source).toBe('service-b');
            expect(mockAxiosPost).not.toHaveBeenCalled();

            const reviewsInDb = await importedModules.dbGet('SELECT * FROM service_reviews WHERE id = ?', [res.body.id]);
            expect(reviewsInDb).toBeDefined();
            expect(reviewsInDb.comment).toBe('Great service! Loved the atmosphere.');
        });

        test('GET /reviews should return all reviews', async () => {
            await importedModules.dbRun(
                `INSERT INTO service_reviews (id, customerName, comment, rating, source)
                 VALUES (?, ?, ?, ?, ?)`,
                ['rev-1', 'Sarah', 'Good experience', 4, 'service-b']
            );
            await importedModules.dbRun(
                `INSERT INTO service_reviews (id, customerName, comment, rating, source)
                 VALUES (?, ?, ?, ?, ?)`,
                ['rev-2', 'David', 'Excellent!', 5, 'service-b']
            );

            const res = await request(app).get('/reviews');
            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(2);
            expect(res.body[0].customerName).toBe('Sarah');
            expect(res.body[1].rating).toBe(5);
        });

        test('POST /review should return 400 for missing customerName or rating', async () => {
            const res1 = await request(app).post('/review').send({ comment: 'Only comment' });
            expect(res1.statusCode).toEqual(400);
            expect(res1.body).toHaveProperty('error', 'customerName and rating are required');

            const res2 = await request(app).post('/review').send({ customerName: 'TestUser', comment: 'No rating' });
            expect(res2.statusCode).toEqual(400);
            expect(res2.body).toHaveProperty('error', 'customerName and rating are required');
        });
    });

    describe('Notification Endpoints', () => {
        test('POST /notify-reservation should update or insert a confirmed reservation', async () => {
            const reservationData = {
                id: `notif-reserv-${uuidv4()}`,
                customerName: 'Notification Test',
                status: 'pending'
            };
            const tableInfo = {
                table: 'T15',
                status: 'occupied'
            };

            const res = await request(app).post('/notify-reservation').send({ reservation: reservationData, tableInfo });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true);

            const updatedReservation = await importedModules.dbGet('SELECT * FROM reservations WHERE id = ?', [reservationData.id]);
            expect(updatedReservation).toBeDefined();
            expect(updatedReservation.status).toBe('confirmed');
            expect(updatedReservation.tableNumber).toBe('T15');
            expect(updatedReservation.tableStatus).toBe('occupied');
        });

        test('POST /reservation/:id/approved should update reservation to confirmed status and assign table', async () => {
            const reservationId = `approved-reserv-${uuidv4()}`;
            await importedModules.dbRun(
                "INSERT INTO reservations (id, customerName, status) VALUES (?, ?, ?)",
                [reservationId, 'Approver Test', 'pending']
            );

            const tableNumber = 'T20';
            const res = await request(app).post(`/reservation/${reservationId}/approved`).send({ tableNumber });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toBe('อัปเดตการจองเป็น confirmed แล้ว');

            const finalReservation = await importedModules.dbGet('SELECT * FROM reservations WHERE id = ?', [reservationId]);
            expect(finalReservation.status).toBe('confirmed');
            expect(finalReservation.tableNumber).toBe('T20');
        });

        test('POST /reservation/:id/approved should return 400 if tableNumber is missing', async () => {
            const reservationId = `approved-reserv-no-table-${uuidv4()}`;
            await importedModules.dbRun(
                "INSERT INTO reservations (id, customerName, status) VALUES (?, ?, ?)",
                [reservationId, 'Missing Table Test', 'pending']
            );

            const res = await request(app).post(`/reservation/${reservationId}/approved`).send({});
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('error', 'ต้องระบุ tableNumber');
        });
    });

    describe('Service A Data Endpoints (Mocked)', () => {
        test('GET /menu should return mocked menu data', async () => {
            const res = await request(app).get('/menu');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([{ id: "mock-menu-1", name: "Mock Dish", price: 9.99 }]);
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });

        test('GET /tables should return mocked table data', async () => {
            const res = await request(app).get('/tables');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([{ id: "mock-table-1", capacity: 4, status: "available" }]);
            expect(mockAxiosGet).not.toHaveBeenCalled();
        });
    });
});