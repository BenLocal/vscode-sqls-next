export enum DatabaseDriver {
  MySQL = "mysql",
  SQLite = "sqlite3",
  PostgreSQL = "postgresql",
  ClickHouse = "clickhouse",
}

export interface InitializeOptions {
  connectionConfig: ConnectionConfig | undefined;
}

export interface ConnectionConfig {
  alias: string;
  driver: DatabaseDriver;
  dataSourceName: string;
}

export interface DidChangeConfigurationParams {
  settings: DidChangeConfigurationSettings
}

export interface DidChangeConfigurationSettings {
  sqls: SqlsSettingConfig
}

export interface SqlsSettingConfig {
  lowercaseKeywords: boolean;
  connections: SqlsDBConfig[];
}

export interface SqlsDBConfig {
  alias: string;
  driver: "mysql" | "sqlite3" | "postgres";
  dataSourceName: string;
}
