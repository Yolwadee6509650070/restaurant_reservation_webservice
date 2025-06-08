const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = 4000;
const SERVICE_A_URL = "http://localhost:3000";

// Database Setup
const dbPath = path.resolve(__dirname, "serviceB.sqlite");
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error("❌ Database connection error:", err.message);
        process.exit(1);
    }
    console.log("✅ Connected to SQLite (serviceB.sqlite)");
    initializeDatabase();
});

function initializeDatabase() {
    db.serialize(() => {
        db.run('CREATE TABLE IF NOT EXISTS reservations (\n' +
            'id TEXT PRIMARY KEY,\n' +
            'customerName TEXT NOT NULL,\n' +
            "status TEXT NOT NULL DEFAULT 'pending',\n" +
            'tableNumber TEXT,\n' +
            'tableStatus TEXT,\n' +
            "createdAt TEXT DEFAULT (datetime('now'))\n" +
            ')', function(err) {
            if (err) {
                console.error('Error creating reservations table:', err);
            } else {
                console.log('✅ Reservations table created or already exists');
            }
        });

        db.run(`CREATE TABLE IF NOT EXISTS service_reviews (
            id TEXT PRIMARY KEY,
            customerName TEXT NOT NULL,
            comment TEXT,
            rating INTEGER CHECK (rating BETWEEN 1 AND 5),
            timestamp TEXT DEFAULT (datetime('now')),
            source TEXT NOT NULL
        )`, (err) => {
            if (err) console.error("Error creating service_reviews table:", err);
        });

        // Add promotions table with proper error handling
        db.run(`CREATE TABLE IF NOT EXISTS promotions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            discount_percentage REAL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        )`, (err) => {
            if (err) {
                console.error("Error creating promotions table:", err);
            } else {
                console.log("✅ Promotions table created or already exists");
                
                // Get all columns from the table
                db.all("PRAGMA table_info(promotions)", (err, columns) => {
                    if (err) {
                        console.error("Error checking table columns:", err);
                        return;
                    }
                    
                    // Check if discount_percentage exists
                    const hasDiscountColumn = columns && Array.isArray(columns) && 
                                           columns.some(col => col.name === "discount_percentage");
                    
                    if (!hasDiscountColumn) {
                        // Add the missing column
                        db.run("ALTER TABLE promotions ADD COLUMN discount_percentage REAL", (err) => {
                            if (err) {
                                console.error("Error adding discount_percentage column:", err);
                            } else {
                                console.log("✅ Added discount_percentage column to promotions table");
                                insertSamplePromotions();
                            }
                        });
                    } else {
                        insertSamplePromotions();
                    }
                });
            }
        });
    });
}

function insertSamplePromotions() {
    db.get("SELECT COUNT(*) as count FROM promotions", (err, row) => {
        if (err) return console.error("Error counting promotions:", err);
        if (row.count === 0) {
            const samplePromotions = [
                ["p-1", "Summer Special", "Get 20% off on all drinks", 20.0, "2023-06-01", "2099-08-31"],
                ["p-2", "Happy Hour", "50% off appetizers from 4-6pm", 50.0, "2023-01-01", "2099-12-31"],
                ["p-3", "Weekend Brunch", "Free dessert with main course", 0.0, "2023-01-01", "2099-12-31"]
            ];
            const stmt = db.prepare("INSERT INTO promotions (id, name, description, discount_percentage, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)");
            samplePromotions.forEach(promo => {
                stmt.run(promo, (err) => {
                    if (err) console.error("Error inserting promotion:", err);
                });
            });
            stmt.finalize();
            console.log("✅ Inserted sample promotions");
        }
    });
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

// Helper Functions
const dbRun = (query, params) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            err ? reject(err) : resolve(this);
        });
    });
};

const dbGet = (query, params) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            err ? reject(err) : resolve(row);
        });
    });
};

const dbAll = (query, params) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            err ? reject(err) : resolve(rows);
        });
    });
};

// Routes
app.get("/health", (req, res) => {
    res.json({ 
        status: "ok", 
        service: "Service B", 
        timestamp: new Date().toISOString() 
    });
});

app.get("/db-health", (req, res) => {
    db.get("SELECT name FROM sqlite_master WHERE type='table'", (err, row) => {
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

// Service A Data Endpoints
app.get("/menu", async (req, res) => {
    try {
        const response = await axios.get(`${SERVICE_A_URL}/menu`);
        res.json(response.data);
    } catch (error) {
        console.error("Failed to fetch menu from Service A:", error.message);
        res.status(500).json({ 
            error: "Failed to fetch menu data" 
        });
    }
});

app.get("/tables", async (req, res) => {
    try {
        const response = await axios.get(`${SERVICE_A_URL}/tables`);
        res.json(response.data);
    } catch (error) {
        console.error("Failed to fetch tables from Service A:", error.message);
        res.status(500).json({ 
            error: "Failed to fetch table data" 
        });
    }
});

// Promotion Endpoints
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
        if (!name || !discount_percentage || !start_date || !end_date) {
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

// Reservation Endpoints
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

// ปรับปรุง endpoint การจองใน Service B

// ✅ POST: สร้างการจองใหม่ (ปรับปรุงแล้ว)
app.post("/reservation", async (req, res) => {
    try {
        const { customerName } = req.body;
        if (!customerName) {
            return res.status(400).json({ error: "ต้องระบุชื่อลูกค้า" });
        }

        const reservationId = `reserv-${uuidv4()}`;
        
        // 1. บันทึกในฐานข้อมูล Service B (สถานะ pending)
        await dbRun(
            "INSERT INTO reservations (id, customerName, status) VALUES (?, ?, ?)",
            [reservationId, customerName, "pending"]
        );

        // 2. ส่งคำขอไปยัง Service A
        const serviceAResponse = await axios.post(`${SERVICE_A_URL}/reserve`, {
            id: reservationId,
            customerName
        });

        // 3. ตอบกลับลูกค้าว่าการจองอยู่ในระหว่างดำเนินการ
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

// ✅ POST: รับการอัปเดตสถานะจาก Service A (ปรับปรุงแล้ว)
app.post("/reservation-status", async (req, res) => {
    try {
        const { reservationId, status, tableNumber, message } = req.body;
        
        // 1. อัปเดตสถานะในฐานข้อมูล Service B
        await dbRun(
            "UPDATE reservations SET status = ?, tableNumber = ? WHERE id = ?",
            [status, tableNumber, reservationId]
        );

        // 2. ตอบกลับ Service A ว่าอัปเดตสำเร็จ
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

// เพิ่ม endpoint สำหรับยกเลิกการจอง
app.put("/reservation/:id/cancel", async (req, res) => {
    try {
        const { id } = req.params;
        
        // ตรวจสอบว่ามีการจองนี้จริงหรือไม่
        const reservation = await dbGet(
            "SELECT * FROM reservations WHERE id = ?", 
            [id]
        );
        
        if (!reservation) {
            return res.status(404).json({ error: "Reservation not found" });
        }
        
        // อัปเดตสถานะเป็น cancelled
        await dbRun(
            "UPDATE reservations SET status = 'cancelled' WHERE id = ?",
            [id]
        );
        
        // ส่งคำขอไปยัง Service A เพื่ออัปเดตสถานะโต๊ะ (หากมีการจองโต๊ะ)
        if (reservation.tableNumber) {
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

// Review Endpoints
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
        if (!customerName || !rating) {
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

        await axios.post(`${SERVICE_A_URL}/add-review`, review)
            .catch(e => {
                console.warn("Failed to sync review to Service A:", e.message);
            });

        res.json(review);
    } catch (error) {
        console.error("Review submission error:", error);
        res.status(500).json({ 
            error: "Failed to submit review" 
        });
    }
});

// Notification Endpoints
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

    await dbRun(
        "UPDATE reservations SET tableNumber = ?, status = 'confirmed' WHERE id = ?",
        [tableNumber, id]
    );

    res.json({ message: "อัปเดตการจองเป็น confirmed แล้ว" });
});


// Start Server
app.listen(PORT, () => {
    console.log(`✅ Service B running on port ${PORT}`);
});

// Error Handling
process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
    process.exit(1);
});