package dev.manager.backend;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DBConnection {
    
    public static Connection getConnection(String host, String port, String dbName, String user, String password) throws SQLException {
        String url = String.format("jdbc:mariadb://%s:%s/%s", host, port, dbName);
        return DriverManager.getConnection(url, user, password);
    }
}