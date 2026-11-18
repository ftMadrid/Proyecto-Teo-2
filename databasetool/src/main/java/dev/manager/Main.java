package dev.manager;

import com.formdev.flatlaf.FlatDarkLaf;

import javax.swing.SwingUtilities;
import javax.swing.UIManager;
import dev.manager.frames.LoginFrame;

public class Main {
    public static void main(String[] args) {
        try {
            UIManager.setLookAndFeel(new FlatDarkLaf());
        } catch (Exception ex) {
            System.err.println("Error al inicializar FlatLaf: " + ex.getMessage());
        }

        SwingUtilities.invokeLater(() -> {
            new LoginFrame().setVisible(true);
        });
    }
}
