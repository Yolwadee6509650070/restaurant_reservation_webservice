
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URI;
import java.util.Scanner;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

public class ClientB {
    private static final String SERVICE_A_URL = "http://localhost:3000";
    private static final Scanner scanner = new Scanner(System.in);

    public static void main(String[] args) {
        System.out.println("==== Client B ====");
        boolean running = true;

        while (running) {
            System.out.println("\nเลือกบริการ:");
            System.out.println("1 = ขอเมนูอาหาร (GET /menu)");
            System.out.println("2 = ขอข้อมูลโต๊ะ (GET /tables)");
            System.out.println("3 = ส่งรีวิว (POST /add-review)");
            System.out.println("4 = ดูสถานะการจองล่าสุด (GET /status)");
            System.out.println("5 = จองโต๊ะ (POST /reserve)");
            System.out.println("6 = ยกเลิกการจอง (POST /cancel)");
            System.out.println("7 = ขอข้อมูลโปรโมชั่น (GET /get-promotions)");
            System.out.println("8 = ดูรีวิวทั้งหมด (GET /all-reviews)");
            System.out.println("9 = ตรวจสอบสถานะของ Service A (GET /health)");
            System.out.println("0 = ออกจากโปรแกรม");
            System.out.print("กรุณาเลือก (0-9): ");

            String choice = scanner.nextLine();

            switch (choice) {
                case "0" -> running = false;
                case "1" -> getMenu();
                case "2" -> getTables();
                case "3" -> addReview();
                case "4" -> getStatus();
                case "5" -> createReservation();
                case "6" -> cancelReservation();
                case "7" -> getPromotions();
                case "8" -> getAllReviews();
                case "9" -> checkHealth();
                default -> System.out.println("เลือกไม่ถูกต้อง กรุณาลองใหม่");
            }
        }

        System.out.println("ปิดโปรแกรม Client B");
        scanner.close();
    }

    private static void getMenu() {
        sendGet(SERVICE_A_URL + "/menu");
    }

    private static void getTables() {
        sendGet(SERVICE_A_URL + "/tables");
    }

    private static void getStatus() {
        sendGet(SERVICE_A_URL + "/status");
    }

    private static void getPromotions() {
        sendGet(SERVICE_A_URL + "/get-promotions");
    }

    private static void getAllReviews() {
        sendGet(SERVICE_A_URL + "/all-reviews");
    }

    private static void checkHealth() {
        sendGet(SERVICE_A_URL + "/health");
    }

    private static void createReservation() {
        System.out.println("\n== จองโต๊ะ ==");

        System.out.print("ชื่อผู้จอง: ");
        String name = scanner.nextLine();

        System.out.print("เบอร์โทรศัพท์: ");
        String phone = scanner.nextLine();

        System.out.print("จำนวนคน: ");
        int guests = Integer.parseInt(scanner.nextLine());

        // ใช้วันที่ปัจจุบันหรือรับจากผู้ใช้
        LocalDate today = LocalDate.now();
        System.out.print("วันที่จอง [" + today.format(DateTimeFormatter.ISO_DATE) + "]: ");
        String dateInput = scanner.nextLine();
        String date = dateInput.isEmpty() ? today.format(DateTimeFormatter.ISO_DATE) : dateInput;

        // ใช้เวลาปัจจุบันหรือรับจากผู้ใช้
        LocalTime now = LocalTime.now();
        String formattedTime = now.format(DateTimeFormatter.ofPattern("HH:mm"));
        System.out.print("เวลาจอง [" + formattedTime + "]: ");
        String timeInput = scanner.nextLine();
        String time = timeInput.isEmpty() ? formattedTime : timeInput;

        String json = String.format(
                """
                        {
                            "name": "%s",
                            "phone": "%s",
                            "guests": %d,
                            "date": "%s",
                            "time": "%s"
                        }
                        """, name, phone, guests, date, time);

        sendPost(SERVICE_A_URL + "/reserve", json);
    }

    private static void addReview() {
        System.out.println("\n== ส่งรีวิว ==");

        System.out.print("ชื่อผู้รีวิว: ");
        String reviewer = scanner.nextLine();

        System.out.print("คะแนน (1-5): ");
        int rating = Integer.parseInt(scanner.nextLine());

        System.out.print("ความคิดเห็น: ");
        String comment = scanner.nextLine();

        System.out.print("รายการอาหารที่รับประทาน (คั่นด้วยเครื่องหมาย ,): ");
        String dishesInput = scanner.nextLine();

        // แปลงรายการอาหารเป็น JSON array
        String[] dishesArray = dishesInput.split(",");
        StringBuilder dishesJson = new StringBuilder("[");
        for (int i = 0; i < dishesArray.length; i++) {
            dishesJson.append("\"").append(dishesArray[i].trim()).append("\"");
            if (i < dishesArray.length - 1) {
                dishesJson.append(", ");
            }
        }
        dishesJson.append("]");

        String json = String.format(
                """
                        {
                            "reviewer": "%s",
                            "rating": %d,
                            "comment": "%s",
                            "dishes": %s
                        }
                        """, reviewer, rating, comment, dishesJson);

        sendPost(SERVICE_A_URL + "/add-review", json);
    }

    private static void cancelReservation() {
        System.out.println("\n== ยกเลิกการจอง ==");

        System.out.print("รหัสการจอง (หากต้องการยกเลิกการจองล่าสุดให้กด Enter): ");
        String id = scanner.nextLine();

        String json;
        if (id.isEmpty()) {
            json = "{}";
        } else {
            json = String.format(
                    """
                            {
                                "id": "%s"
                            }
                            """, id);
        }

        sendPost(SERVICE_A_URL + "/cancel", json);
    }

    private static void sendGet(String urlStr) {
        try {
            System.out.println("\nกำลังส่งคำขอ GET ไปที่ " + urlStr);

            URL url = URI.create(urlStr).toURL();
            HttpURLConnection con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("GET");

            int responseCode = con.getResponseCode();
            System.out.println("รหัสตอบกลับ: " + responseCode);

            if (responseCode >= 200 && responseCode < 300) {
                System.out.println("ข้อมูลที่ได้รับ:");
                BufferedReader in = new BufferedReader(new InputStreamReader(con.getInputStream()));
                String line;
                StringBuilder response = new StringBuilder();
                while ((line = in.readLine()) != null) {
                    response.append(line);
                }
                in.close();

                // แสดงผล JSON ในรูปแบบที่อ่านง่าย
                prettyPrintJson(response.toString());
            } else {
                System.out.println("เกิดข้อผิดพลาด: " + con.getResponseMessage());
            }
        } catch (Exception e) {
            System.out.println("เกิดข้อผิดพลาด: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private static void sendPost(String urlStr, String json) {
        try {
            System.out.println("\nกำลังส่งคำขอ POST ไปที่ " + urlStr);
            System.out.println("ข้อมูล: " + json);

            URL url = URI.create(urlStr).toURL();
            HttpURLConnection con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("POST");
            con.setRequestProperty("Content-Type", "application/json");
            con.setDoOutput(true);

            try (OutputStream os = con.getOutputStream()) {
                byte[] input = json.getBytes("utf-8");
                os.write(input, 0, input.length);
            }

            int responseCode = con.getResponseCode();
            System.out.println("รหัสตอบกลับ: " + responseCode);

            if (responseCode >= 200 && responseCode < 300) {
                System.out.println("ข้อมูลที่ได้รับ:");
                BufferedReader in = new BufferedReader(new InputStreamReader(con.getInputStream()));
                String line;
                StringBuilder response = new StringBuilder();
                while ((line = in.readLine()) != null) {
                    response.append(line);
                }
                in.close();

                // แสดงผล JSON ในรูปแบบที่อ่านง่าย
                prettyPrintJson(response.toString());
            } else {
                System.out.println("เกิดข้อผิดพลาด: " + con.getResponseMessage());

                // อ่านข้อมูลจาก error stream
                BufferedReader err = new BufferedReader(new InputStreamReader(con.getErrorStream()));
                String errLine;
                StringBuilder errResponse = new StringBuilder();
                while ((errLine = err.readLine()) != null) {
                    errResponse.append(errLine);
                }
                err.close();

                System.out.println("ข้อความผิดพลาด: " + errResponse);
            }
        } catch (Exception e) {
            System.out.println("เกิดข้อผิดพลาด: " + e.getMessage());
            e.printStackTrace();
        }
    }

    // ฟังก์ชันแสดงผล JSON ในรูปแบบที่อ่านง่าย (อย่างง่าย)
    private static void prettyPrintJson(String json) {
        int indent = 0;
        boolean inQuotes = false;
        StringBuilder pretty = new StringBuilder();

        for (char c : json.toCharArray()) {
            if (c == '\"' && (pretty.length() == 0 || pretty.charAt(pretty.length() - 1) != '\\')) {
                inQuotes = !inQuotes;
                pretty.append(c);
            } else if (!inQuotes) {
                if (c == '{' || c == '[') {
                    pretty.append(c).append("\n");
                    indent += 2;
                    for (int i = 0; i < indent; i++)
                        pretty.append(" ");
                } else if (c == '}' || c == ']') {
                    pretty.append("\n");
                    indent -= 2;
                    for (int i = 0; i < indent; i++)
                        pretty.append(" ");
                    pretty.append(c);
                } else if (c == ',') {
                    pretty.append(c).append("\n");
                    for (int i = 0; i < indent; i++)
                        pretty.append(" ");
                } else if (c == ':') {
                    pretty.append(c).append(" ");
                } else {
                    pretty.append(c);
                }
            } else {
                pretty.append(c);
            }
        }

        System.out.println(pretty);
    }
}
