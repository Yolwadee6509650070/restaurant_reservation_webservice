// index.js
const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = 4000;
const SERVICE_A_URL = "http://localhost:3000";

const DB_PATH = process.env.NODE_ENV === "test" ? "./test_serviceB.sqlite" : "./serviceB.sqlite";
let currentDb = null; // Use a distinct variable for the current active DB instance

function initializeDatabase(callback) {
    if (!currentDb) {
        if (callback) callback(new Error("Database connection not established."));
        return;
    }

    currentDb.serialize(() => {
        currentDb.run(`CREATE TABLE IF NOT EXISTS promotions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            discount_percentage REAL NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        )`, function(err) {
            if (err) {
                if (process.env.NODE_ENV !== "test") {
                    console.error("Error creating promotions table:", err);
                }
                if (callback) callback(err);
                return;
            } else {
                if (process.env.NODE_ENV !== "test") {
                    console.log("✅ Promotions table created or already exists");
                }
                insertSamplePromotions();
            }
        });

        currentDb.run('CREATE TABLE IF NOT EXISTS reservations (\n' +
            'id TEXT PRIMARY KEY,\n' +
            'customerName TEXT NOT NULL,\n' +
            "status TEXT NOT NULL DEFAULT 'pending',\n" +
            'tableNumber TEXT,\n' +
            'tableStatus TEXT,\n' +
            "createdAt TEXT DEFAULT (datetime('now'))\n" +
            ')', function(err) {
            if (err) {
                if (process.env.NODE_ENV !== "test") {
                    console.error('Error creating reservations table:', err);
                }
            } else {
                if (process.env.NODE_ENV !== "test") {
                    console.log('✅ Reservations table created or already exists');
                }
            }
        });

        currentDb.run(`CREATE TABLE IF NOT EXISTS service_reviews (
            id TEXT PRIMARY KEY,
            customerName TEXT NOT NULL,
            comment TEXT,
            rating INTEGER CHECK (rating BETWEEN 1 AND 5),
            timestamp TEXT DEFAULT (datetime('now')),
            source TEXT NOT NULL
        )`, (err) => {
            if (err) console.error("Error creating service_reviews table:", err);
            if (callback) callback(null);
        });
    });
}

function insertSamplePromotions() {
    if (!currentDb) return;
    currentDb.get("SELECT COUNT(*) as count FROM promotions", (err, row) => {
        if (err) {
            console.error("Error counting promotions for samples:", err);
            return;
        }
        if (row.count === 0) {
            const samplePromotions = [
                ["p-1", "Summer Special", "Get 20% off on all drinks", 20.0, "2023-06-01", "2099-08-31"],
                ["p-2", "Happy Hour", "50% off appetizers from 4-6pm", 50.0, "2023-01-01", "2099-12-31"],
                ["p-3", "Weekend Brunch", "Free dessert with main course", 0.0, "2023-01-01", "2099-12-31"]
            ];
            const stmt = currentDb.prepare("INSERT INTO promotions (id, name, description, discount_percentage, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)");
            samplePromotions.forEach(promo => {
                stmt.run(promo, (err) => {
                    if (err) console.error("Error inserting promotion:", err);
                });
            });
            stmt.finalize();
            if (process.env.NODE_ENV !== "test") {
                console.log("✅ Inserted sample promotions");
            }
        }
    });
}

const connectDb = () => {
    return new Promise((resolve, reject) => {
        // Close any existing connection before opening a new one in test mode
        if (process.env.NODE_ENV === "test" && currentDb && currentDb.open) {
            currentDb.close((closeErr) => {
                if (closeErr) {
                    console.warn(`Warning: Could not close previous DB connection before opening new one: ${closeErr.message}`);
                    // Continue attempting to open new, but log warning
                }
                // Proceed to open new DB after attempt to close old
                _openNewDbConnection(resolve, reject);
            });
        } else if (currentDb && currentDb.open) {
            // In non-test mode, if already connected, just resolve
            resolve();
        } else {
            _openNewDbConnection(resolve, reject);
        }
    });
};

function _openNewDbConnection(resolve, reject) {
    currentDb = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            if (process.env.NODE_ENV !== "test") {
                console.error("❌ Database connection error:", err.message);
                process.exit(1);
            }
            return reject(err);
        } else {
            if (process.env.NODE_ENV !== "test") {
                console.log(`✅ Connected to SQLite (${DB_PATH})`);
            }
            initializeDatabase((initErr) => {
                if (initErr) {
                    return reject(initErr);
                }
                resolve();
            });
        }
    });
}


const dbRun = (query, params) => {
    if (!currentDb) return Promise.reject(new Error("Database not connected for dbRun."));
    return new Promise((resolve, reject) => {
        currentDb.run(query, params, function(err) {
            err ? reject(err) : resolve(this);
        });
    });
};

const dbGet = (query, params) => {
    if (!currentDb) return Promise.reject(new Error("Database not connected for dbGet."));
    return new Promise((resolve, reject) => {
        currentDb.get(query, params, (err, row) => {
            err ? reject(err) : resolve(row);
        });
    });
};

const dbAll = (query, params) => {
    if (!currentDb) return Promise.reject(new Error("Database not connected for dbAll."));
    return new Promise((resolve, reject) => {
        currentDb.all(query, params, (err, rows) => {
            err ? reject(err) : resolve(rows);
        });
    });
};

const closeDb = (callback) => {
    if (currentDb && currentDb.open) {
        currentDb.close((err) => {
            if (err) {
                console.error("Error closing database:", err.message);
                if (callback) callback(err);
            } else {
                if (process.env.NODE_ENV !== "test") {
                    console.log("✅ Database connection closed.");
                }
                currentDb = null; // Clear the reference after closing
                if (callback) callback(null);
            }
        });
    } else {
        if (process.env.NODE_ENV !== "test") {
            console.log("Database was not open to close.");
        }
        currentDb = null; // Ensure it's null even if not opened
        if (callback) callback(null);
    }
};

function getGreeting(name) {
    return `Welcome, ${name}!`;
}

// Middleware
app.use(express.json());
app.use((req, res, next) => {
    res.header({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
    });
    req.method === "OPTIONS" ? res.sendStatus(200) : next();
});

// Routes
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "Service B",
        timestamp: new Date().toISOString()
    });
});

app.get("/db-health", (req, res) => {
    if (!currentDb || !currentDb.open) {
        return res.status(500).json({
            status: "unhealthy",
            error: "Database connection not established."
        });
    }
    currentDb.get("SELECT name FROM sqlite_master WHERE type='table'", (err, row) => {
        if (err) {
            console.error("Database health check failed:", err);
            return res.status(500).json({
                status: "unhealthy",
                error: err.message
            });
        }
        res.json({
            status: "healthy",
            tables: row
        });
    });
});

app.get("/menu", async (req, res) => {
    try {
        if (process.env.NODE_ENV !== "test") {
            const response = await axios.get(`${SERVICE_A_URL}/menu`);
            res.json(response.data);
        } else {
            res.json([{ id: "mock-menu-1", name: "Mock Dish", price: 9.99 }]);
        }
    } catch (error) {
        console.error("Failed to fetch menu from Service A:", error.message);
        res.status(500).json({
            error: "Failed to fetch menu data"
        });
    }
});

app.get("/tables", async (req, res) => {
    try {
        if (process.env.NODE_ENV !== "test") {
            const response = await axios.get(`${SERVICE_A_URL}/tables`);
            res.json(response.data);
        } else {
            res.json([{ id: "mock-table-1", capacity: 4, status: "available" }]);
        }
    } catch (error) {
        console.error("Failed to fetch tables from Service A:", error.message);
        res.status(500).json({
            error: "Failed to fetch table data"
        });
    }
});

app.get("/promotions", async (req, res) => {
    try {
        const currentDate = new Date().toISOString().split('T')[0];
        const rows = await dbAll(
            `SELECT * FROM promotions
             WHERE start_date <= ? AND end_date >= ? AND is_active = 1
             ORDER BY discount_percentage DESC`,
            [currentDate, currentDate]
        );
        res.json(rows);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({
            error: "Failed to fetch promotions"
        });
    }
});

app.post("/promotions", async (req, res) => {
    try {
        const { name, description, discount_percentage, start_date, end_date } = req.body;
        if (!name || discount_percentage === undefined || !start_date || !end_date) {
            return res.status(400).json({
                error: "Missing required fields"
            });
        }

        const promotion = {
            id: `p-${uuidv4()}`,
            name,
            description: description || "",
            discount_percentage: parseFloat(discount_percentage),
            start_date,
            end_date,
            is_active: 1
        };

        await dbRun(
            `INSERT INTO promotions
             (id, name, description, discount_percentage, start_date, end_date, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            Object.values(promotion)
        );

        res.json(promotion);
    } catch (error) {
        console.error("Promotion creation error:", error);
        res.status(500).json({
            error: "Failed to create promotion"
        });
    }
});

app.get("/all-reservations", async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM reservations");
        res.json(rows);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({
            error: "Failed to fetch reservations"
        });
    }
});

app.post("/reservation", async (req, res) => {
    try {
        const { customerName } = req.body;
        if (!customerName) {
            return res.status(400).json({ error: "ต้องระบุชื่อลูกค้า" });
        }

        const reservationId = `reserv-${uuidv4()}`;

        await dbRun(
            "INSERT INTO reservations (id, customerName, status) VALUES (?, ?, ?)",
            [reservationId, customerName, "pending"]
        );

        if (process.env.NODE_ENV !== "test") {
            await axios.post(`${SERVICE_A_URL}/reserve`, {
                id: reservationId,
                customerName
            }).catch(e => {
                console.warn("Failed to notify Service A about new reservation:", e.message);
            });
        }

        res.json({
            status: "pending",
            message: "การจองของคุณกำลังดำเนินการ กรุณารอการยืนยัน",
            reservationId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Reservation error:", error.message);
        res.status(500).json({
            error: "เกิดข้อผิดพลาดในการจอง",
            details: error.message
        });
    }
});

app.post("/reservation-status", async (req, res) => {
    try {
        const { reservationId, status, tableNumber, message } = req.body;

        await dbRun(
            "UPDATE reservations SET status = ?, tableNumber = ? WHERE id = ?",
            [status, tableNumber, reservationId]
        );

        res.json({
            status: "success",
            reservationId,
            updatedStatus: status
        });

    } catch (error) {
        console.error("Status update error:", error.message);
        res.status(500).json({
            error: "ไม่สามารถอัปเดตสถานะการจองได้"
        });
    }
});

app.put("/reservation/:id/cancel", async (req, res) => {
    try {
        const { id } = req.params;

        const reservation = await dbGet(
            "SELECT * FROM reservations WHERE id = ?",
            [id]
        );

        if (!reservation) {
            return res.status(404).json({ error: "Reservation not found" });
        }

        await dbRun(
            "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
            [id]
        );

        if (reservation.tableNumber && process.env.NODE_ENV !== "test") {
            await axios.put(`${SERVICE_A_URL}/tables/${reservation.tableNumber}/release`, {
                status: "available"
            }).catch(e => {
                console.warn("Failed to update table status in Service A:", e.message);
            });
        }

        const updatedReservation = await dbGet(
            "SELECT * FROM reservations WHERE id = ?",
            [id]
        );

        res.json(updatedReservation);
    } catch (error) {
        console.error("Cancellation error:", error);
        res.status(500).json({
            error: "Failed to cancel reservation"
        });
    }
});

app.get("/reviews", async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM service_reviews");
        res.json(rows);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).json({
            error: "Failed to fetch reviews"
        });
    }
});

app.post("/review", async (req, res) => {
    try {
        const { customerName, comment, rating } = req.body;
        if (!customerName || rating === undefined) {
            return res.status(400).json({
                error: "customerName and rating are required"
            });
        }

        const review = {
            id: `b-${uuidv4()}`,
            customerName,
            comment: comment || "",
            rating: Math.min(5, Math.max(1, parseInt(rating))),
            timestamp: new Date().toISOString(),
            source: "service-b"
        };

        await dbRun(
            `INSERT INTO service_reviews
             (id, customerName, comment, rating, timestamp, source)
             VALUES (?, ?, ?, ?, ?, ?)`,
            Object.values(review)
        );

        if (process.env.NODE_ENV !== "test") {
            await axios.post(`${SERVICE_A_URL}/add-review`, review)
                .catch(e => {
                    console.warn("Failed to sync review to Service A:", e.message);
                });
        }

        res.json(review);
    } catch (error) {
        console.error("Review submission error:", error);
        res.status(500).json({
            error: "Failed to submit review"
        });
    }
});

app.post("/notify-reservation", async (req, res) => {
    try {
        const { reservation, tableInfo } = req.body;
        await dbRun(
            `INSERT OR REPLACE INTO reservations
             (id, customerName, status, tableNumber, tableStatus)
             VALUES (?, ?, ?, ?, ?)`,
            [
                reservation.id,
                reservation.customerName,
                "confirmed",
                tableInfo?.table,
                tableInfo?.status
            ]
        );
        res.json({ success: true });
    } catch (error) {
        console.error("Notification error:", error);
        res.status(500).json({
            error: "Failed to process notification"
        });
    }
});

app.post("/reservation/:id/approved", async (req, res) => {
    const { id } = req.params;
    const { tableNumber } = req.body;

    if (!tableNumber) {
        return res.status(400).json({ error: "ต้องระบุ tableNumber" });
    }

    try {
        await dbRun(
            "UPDATE reservations SET tableNumber = ?, status = 'confirmed' WHERE id = ?",
            [tableNumber, id]
        );
        res.json({ message: "อัปเดตการจองเป็น confirmed แล้ว" });
    } catch (error) {
        console.error("Error approving reservation:", error);
        res.status(500).json({ error: "ไม่สามารถอัปเดตการจองได้" });
    }
});

let server;

// Start Server - only listen if not in test env
if (process.env.NODE_ENV !== "test") {
    connectDb().then(() => {
        server = app.listen(PORT, () => {
            console.log(`✅ Service B running on port ${PORT}`);
        });
    }).catch(err => {
        console.error("Failed to start server due to database connection error:", err);
    });

    // Error Handling - ONLY register in non-test environment
    process.on("unhandledRejection", (reason, promise) => {
        console.error("Unhandled Rejection at:", promise, "reason:", reason);
        process.exit(1);
    });

    process.on("uncaughtException", (err) => {
        console.error("Uncaught exception:", err);
        process.exit(1);
    });
}

module.exports = {
    app,
    get db() { return currentDb; }, // Use a getter to ensure `db` always returns the currentDb instance
    dbRun,
    dbGet,
    dbAll,
    initializeDatabase,
    connectDb,
    server,
    closeDb,
    getGreeting
};