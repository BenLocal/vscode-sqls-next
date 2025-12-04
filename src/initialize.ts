export interface InitializeOptions {
  connectionConfig: ConnectionConfig;
}

export interface ConnectionConfig {
  alias: string;
  driver: "mysql" | "sqlite" | "postgres";
  dataSourceName: string;
}
