import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * Used by start-local.ps1 before Spring Boot starts: tries the MySQL login from DB_HOST, DB_PORT,
 * DB_USERNAME and DB_PASSWORD (read from the environment, never from the command line) and prints
 * only the driver's message, which never contains the password.
 * Exit codes: 0 = login works, 2 = MySQL rejected the username/password, 1 = any other connection problem.
 */
public class MySqlLoginCheck {
    public static void main(String[] args) {
        String url = "jdbc:mysql://" + env("DB_HOST", "localhost") + ":" + env("DB_PORT", "3306") + "/?connectTimeout=5000&serverTimezone=UTC";
        try (Connection ignored = DriverManager.getConnection(url, env("DB_USERNAME", "root"), env("DB_PASSWORD", ""))) {
            System.exit(0);
        } catch (SQLException error) {
            System.err.println(error.getMessage());
            System.exit(error.getErrorCode() == 1045 ? 2 : 1);
        }
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null ? fallback : value;
    }
}
