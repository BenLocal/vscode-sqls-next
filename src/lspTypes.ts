export interface InitializeOptions {
  connectionConfig: ConnectionConfig | undefined;
}

export interface ConnectionConfig {
  alias: string;
  driver: "mysql" | "sqlite" | "postgres";
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
  driver: "mysql" | "sqlite" | "postgres";
  dataSourceName: string;
}
