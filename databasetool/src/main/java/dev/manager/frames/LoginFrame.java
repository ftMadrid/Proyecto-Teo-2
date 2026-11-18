package dev.manager.frames;

import dev.manager.backend.DBConnection;

import javax.swing.*;
import java.awt.*;
import java.io.*;
import java.sql.Connection;
import java.util.HashMap;
import java.util.Map;

public class LoginFrame extends JFrame {
    private JComboBox<String> cbxProfiles;
    private JTextField txtHost, txtPort, txtDbName, txtUser, txtProfileName;
    private JPasswordField txtPassword;
    private JButton btnConnect, btnSaveProfile;
    
    // Mapa para mantener los perfiles cargados en memoria
    private Map<String, String[]> profilesMap;
    private final String FILE_NAME = "conexiones.txt";

    public LoginFrame() {
        profilesMap = new HashMap<>();
        
        setTitle("Database Manager - Conexion");
        setSize(450, 400);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);
        setResizable(false);

        // Panel principal con márgenes
        JPanel mainPanel = new JPanel(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        // Panel superior: Selector de perfiles
        JPanel topPanel = new JPanel(new BorderLayout(10, 10));
        topPanel.add(new JLabel("Perfil Guardado:"), BorderLayout.WEST);
        cbxProfiles = new JComboBox<>();
        cbxProfiles.addItem("--- Nuevo Perfil ---");
        cbxProfiles.addActionListener(e -> loadSelectedProfile());
        topPanel.add(cbxProfiles, BorderLayout.CENTER);
        mainPanel.add(topPanel, BorderLayout.NORTH);

        // Panel central: Formulario de datos
        JPanel formPanel = new JPanel(new GridLayout(6, 2, 10, 15));
        
        formPanel.add(new JLabel("Nombre para guardar (opcional):"));
        txtProfileName = new JTextField();
        formPanel.add(txtProfileName);

        formPanel.add(new JLabel("Host / IP:"));
        txtHost = new JTextField("169.58.242.8");
        formPanel.add(txtHost);

        formPanel.add(new JLabel("Puerto:"));
        txtPort = new JTextField("6333");
        formPanel.add(txtPort);

        formPanel.add(new JLabel("Base de Datos:"));
        txtDbName = new JTextField("test_db");
        formPanel.add(txtDbName);

        formPanel.add(new JLabel("Usuario:"));
        txtUser = new JTextField("mariadb");
        formPanel.add(txtUser);

        formPanel.add(new JLabel("Contraseña:"));
        txtPassword = new JPasswordField();
        formPanel.add(txtPassword);
        
        mainPanel.add(formPanel, BorderLayout.CENTER);

        // Panel inferior: Botones de acción
        JPanel bottomPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 10, 0));
        btnSaveProfile = new JButton("Guardar Perfil");
        btnSaveProfile.addActionListener(e -> saveProfile());
        
        btnConnect = new JButton("Conectar");
        btnConnect.addActionListener(e -> connectToDatabase());

        bottomPanel.add(btnSaveProfile);
        bottomPanel.add(btnConnect);
        mainPanel.add(bottomPanel, BorderLayout.SOUTH);

        add(mainPanel);
        
        // Cargar los perfiles al iniciar la ventana
        loadProfilesFromFile();
    }

    private void connectToDatabase() {
        String host = txtHost.getText().trim();
        String port = txtPort.getText().trim();
        String db = txtDbName.getText().trim();
        String user = txtUser.getText().trim();
        String pass = new String(txtPassword.getPassword());

        if (host.isEmpty() || port.isEmpty() || db.isEmpty() || user.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Por favor llena todos los campos.", "Advertencia", JOptionPane.WARNING_MESSAGE);
            return;
        }

        try {
            // Se comunica con tu clase de backend limpia
            Connection conn = DBConnection.getConnection(host, port, db, user, pass);
            JOptionPane.showMessageDialog(this, "¡Conexión exitosa a " + db + "!", "Éxito", JOptionPane.INFORMATION_MESSAGE);
            
            // TODO: Abrir el Dashboard principal y cerrar este Login
            // new DashboardFrame(conn).setVisible(true);
            // this.dispose();
            
        } catch (Exception ex) {
            JOptionPane.showMessageDialog(this, "Error al conectar:\n" + ex.getMessage(), "Error de Conexión", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void saveProfile() {
        String profileName = txtProfileName.getText().trim();
        if (profileName.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Escribe un nombre para el perfil antes de guardar.", "Advertencia", JOptionPane.WARNING_MESSAGE);
            return;
        }

        String dataLine = String.format("%s,%s,%s,%s,%s,%s",
                profileName,
                txtHost.getText().trim(),
                txtPort.getText().trim(),
                txtDbName.getText().trim(),
                txtUser.getText().trim(),
                new String(txtPassword.getPassword())
        );

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(FILE_NAME, true))) {
            writer.write(dataLine);
            writer.newLine();
            JOptionPane.showMessageDialog(this, "Perfil guardado correctamente.");
            loadProfilesFromFile(); // Refrescar el ComboBox
        } catch (IOException ex) {
            JOptionPane.showMessageDialog(this, "Error al guardar el perfil.", "Error", JOptionPane.ERROR_MESSAGE);
        }
    }

    private void loadProfilesFromFile() {
        cbxProfiles.removeAllItems();
        cbxProfiles.addItem("--- Nuevo Perfil ---");
        profilesMap.clear();

        File file = new File(FILE_NAME);
        if (!file.exists()) return;

        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String[] parts = line.split(",");
                if (parts.length >= 6) {
                    String name = parts[0];
                    profilesMap.put(name, parts);
                    cbxProfiles.addItem(name);
                }
            }
        } catch (IOException ex) {
            System.err.println("Error al cargar perfiles: " + ex.getMessage());
        }
    }

    private void loadSelectedProfile() {
        String selected = (String) cbxProfiles.getSelectedItem();
        if (selected == null || selected.equals("--- Nuevo Perfil ---")) {
            txtProfileName.setText("");
            txtHost.setText("");
            txtPort.setText("3306"); // o 6333
            txtDbName.setText("");
            txtUser.setText("");
            txtPassword.setText("");
            return;
        }

        String[] data = profilesMap.get(selected);
        if (data != null) {
            txtProfileName.setText(data[0]);
            txtHost.setText(data[1]);
            txtPort.setText(data[2]);
            txtDbName.setText(data[3]);
            txtUser.setText(data[4]);
            txtPassword.setText(data[5]);
        }
    }
}