import * as vscode from "vscode";
import * as lsp from "vscode-languageclient/node";

export interface InitializeOptions {
  connectionConfig: ConnectionConfig;
}

export interface ConnectionConfig {
  alias: string;
  driver: "mysql" | "sqlite" | "postgres";
  dataSourceName: string;
}
