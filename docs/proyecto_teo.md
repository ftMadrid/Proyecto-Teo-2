## Instalacion de MariaDB
```

sudo apt install mariadb-server -y
sudo mysql_secure_installation
sudo nano /etc/mysql/mariadb.conf.d/50-server.cnf
```

## Crear usuario
```
CREATE USER 'user'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON *.* TO 'user'@'localhost' WITH GRANT OPTION;
FLUSH PRIVILEGES;
EXIT;
```

## Contenedor de CloudBeaver
```
sudo docker run -d --name cloudbeaver \
  --network host \
  -v /var/cloudbeaver/workspace:/opt/cloudbeaver/workspace \
  dbeaver/cloudbeaver:latest
```

## SQLS
```
SELECT 
    database_name AS esquema,
    table_name AS tabla,
    CONCAT('GRANT SELECT ON ', database_name, '.', table_name, ' TO ''app_readonly''@''localhost'';') AS grant_sql
FROM mysql.innodb_table_stats
WHERE database_name = 'employees';
```
```
SELECT 
    t.database_name AS schema_name,
    t.table_name AS table_name
FROM mysql.innodb_table_stats t
WHERE t.database_name = 'employees' AND 
	t.table_name NOT IN (
      SELECT table_name 
      FROM mysql.innodb_index_stats 
      WHERE database_name = 'employees' AND index_name = 'PRIMARY'
	);
```
```
SELECT 
    database_name AS schema_name,
    table_name AS table_name,
    CONCAT('ALTER TABLE ', database_name, '.', table_name, ' DISABLE KEYS;') AS alter_sql
FROM mysql.innodb_table_stats
WHERE database_name = 'employees';
```
```
SELECT 
    database_name AS schema_table,
    table_name AS table_name,
    CONCAT('ALTER TABLE ', database_name, '.', table_name, ' ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;') AS alter_sql
FROM mysql.innodb_table_stats
WHERE database_name = 'employees';
```