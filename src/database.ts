import * as vscode from "vscode";
import { SqlsClient } from "./lspClient";

export enum DatabaseDriver {
  MySQL = "mysql",
  SQLite = "sqlite",
  PostgreSQL = "postgresql",
}

export interface DatabaseDriverInfo {
  label: string;
  description: string;
  example: string;
}

export const DatabaseDriverMap: Record<DatabaseDriver, DatabaseDriverInfo> = {
  [DatabaseDriver.MySQL]: {
    label: "MySQL",
    description: "MySQL database server",
    example: "user:password@tcp(127.0.0.1:3306)/database",
  },
  [DatabaseDriver.SQLite]: {
    label: "SQLite",
    description: "SQLite database file",
    example: "/path/to/database.db",
  },
  [DatabaseDriver.PostgreSQL]: {
    label: "PostgreSQL",
    description: "PostgreSQL database server",
    example: "postgres://user:password@localhost:5432/database",
  },
};

export function addDatabaseCommand(
  context: vscode.ExtensionContext,
  client: SqlsClient
) {
  const getConnectionConfigOptions = async (
    context: vscode.ExtensionContext
  ): Promise<
    Array<{
      label: string;
      description: string;
      detail: string;
      value: string;
      iconPath: vscode.IconPath | undefined;
    }>
  > => {
    const options = (
      await ConnectionConfigManager.getConnectionConfigs(context)
    ).map(({ selected, config }) => ({
      label: config.alias,
      description: config.driver,
      detail: config.dataSourceName,
      value: config.alias,
      iconPath: selected ? new vscode.ThemeIcon("check") : undefined,
    }));
    return options;
  };

  const addConnectionConfigCommand = vscode.commands.registerCommand(
    "sqls-next.addConnectionConfig",
    async () => {
      const dbDriverOptions = Object.values(DatabaseDriver).map((type) => ({
        label: DatabaseDriverMap[type].label,
        description: DatabaseDriverMap[type].description,
        detail: `e.g. ${DatabaseDriverMap[type].example}`,
        value: type,
      }));
      const driver = await vscode.window.showQuickPick(dbDriverOptions, {
        placeHolder: "Select a database driver",
        ignoreFocusOut: true,
      });
      if (!driver) {
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: "Enter the database name for alias",
        ignoreFocusOut: true,
      });
      if (!name) {
        return;
      }

      const eg = driver.detail;
      let prompt = "Enter the database connection string";
      if (eg) {
        prompt += ` ${eg}`;
      }

      const connString = await vscode.window.showInputBox({
        prompt: prompt,
        ignoreFocusOut: true,
      });
      if (!connString) {
        return;
      }

      const connectionConfig: ConnectionConfig = {
        alias: name,
        driver: driver.value,
        dataSourceName: connString,
      };
      await ConnectionConfigManager.updateConnectionConfig(
        context,
        connectionConfig
      );
    }
  );
  context.subscriptions.push(addConnectionConfigCommand);

  const removeConnectionConfigCommand = vscode.commands.registerCommand(
    "sqls-next.removeConnectionConfig",
    async () => {
      const options = await getConnectionConfigOptions(context);
      const alias = await vscode.window.showQuickPick(options, {
        placeHolder: "Select a connection config to remove",
      });
      if (!alias) {
        return;
      }
      await ConnectionConfigManager.removeConnectionConfig(
        context,
        alias.value
      );
    }
  );
  context.subscriptions.push(removeConnectionConfigCommand);

  const updateConnectionConfigCommand = vscode.commands.registerCommand(
    "sqls-next.updateConnectionConfig",
    async () => {
      const options = await getConnectionConfigOptions(context);
      const alias = await vscode.window.showQuickPick(options, {
        placeHolder: "Select a connection config to update",
      });
      if (!alias) {
        return;
      }

      const current = ConnectionConfigManager.getConnectionConfig(
        context,
        alias.value
      );
      if (!current) {
        return;
      }

      const newDataSourceName = await vscode.window.showInputBox({
        prompt: "Enter the new data source name",
        value: current.dataSourceName ?? "",
        ignoreFocusOut: true,
      });
      if (!newDataSourceName) {
        return;
      }

      current.dataSourceName = newDataSourceName;
      await ConnectionConfigManager.updateConnectionConfig(context, current);
    }
  );
  context.subscriptions.push(updateConnectionConfigCommand);

  const selectConnectionConfigCommand = vscode.commands.registerCommand(
    "sqls-next.selectConnectionConfig",
    async () => {
      const options = await getConnectionConfigOptions(context);
      const alias = await vscode.window.showQuickPick(options, {
        placeHolder: "Select a connection config to set as default",
      });
      if (!alias) {
        return;
      }
      await ConnectionConfigManager.selectConnectionConfigByAlias(
        context,
        alias.value,
        client
      );
    }
  );
  context.subscriptions.push(selectConnectionConfigCommand);

  const clearConnectionConfigCommand = vscode.commands.registerCommand(
    "sqls-next.clearConnectionConfig",
    async () => {
      await ConnectionConfigManager.clearConnectionConfig(context);
    }
  );
  context.subscriptions.push(clearConnectionConfigCommand);
}

export interface ConnectionConfig {
  alias: string;
  driver: string;
  dataSourceName: string;
}

export class ConnectionConfigManager {
  private static readonly DefaultConnectionConfigKey = `sqls.conn.default`;

  public static async clearConnectionConfig(context: vscode.ExtensionContext) {
    await context.globalState.update(
      ConnectionConfigManager.DefaultConnectionConfigKey,
      undefined
    );
    for (const key of context.globalState.keys()) {
      if (key.startsWith("sqls.conn.alias.")) {
        await context.globalState.update(key, undefined);
      }
    }
  }

  public static async updateConnectionConfig(
    context: vscode.ExtensionContext,
    connectionConfig: ConnectionConfig
  ) {
    const key = `sqls.conn.alias.${connectionConfig.alias}`;
    await context.globalState.update(key, connectionConfig);
    return key;
  }

  public static getConnectionConfig(
    context: vscode.ExtensionContext,
    alias: string
  ): ConnectionConfig | undefined {
    const key = `sqls.conn.alias.${alias}`;
    return context.globalState.get<ConnectionConfig | undefined>(key);
  }

  public static async removeConnectionConfig(
    context: vscode.ExtensionContext,
    alias: string
  ) {
    const key = `sqls.conn.alias.${alias}`;
    await context.globalState.update(key, undefined);
  }

  public static async getConnectionConfigs(
    context: vscode.ExtensionContext
  ): Promise<
    Array<{
      selected: boolean;
      config: ConnectionConfig;
    }>
  > {
    const defaultAlias = context.globalState.get<string | undefined>(
      ConnectionConfigManager.DefaultConnectionConfigKey
    );
    const configs: {
      selected: boolean;
      config: ConnectionConfig;
    }[] = [];
    for (const key of context.globalState.keys()) {
      let selected = false;
      if (key.startsWith("sqls.conn.alias.")) {
        const config = context.globalState.get<ConnectionConfig | undefined>(
          key
        );
        if (!config) {
          continue;
        }

        if (defaultAlias && config.alias === defaultAlias) {
          selected = true;
        }
        configs.push({
          selected: selected,
          config: config,
        });
      }
    }
    return configs;
  }

  public static async selectConnectionConfigByAlias(
    context: vscode.ExtensionContext,
    alias: string,
    client: SqlsClient,
    changeDefault: boolean = true
  ) {
    if (changeDefault) {
      await context.globalState.update(
        ConnectionConfigManager.DefaultConnectionConfigKey,
        alias
      );
    }
    const config = this.getConnectionConfig(context, alias);
    if (!config) {
      return;
    }
    return await this.selectConnectionConfigByConnectionConfig(
      context,
      config,
      client
    );
  }

  public static async selectConnectionConfigByConnectionConfig(
    context: vscode.ExtensionContext,
    config: ConnectionConfig,
    client: SqlsClient
  ) {
    await client.didChangeConfiguration({
      settings: {
        sqls: {
          lowercaseKeywords: false,
          connections: [
            {
              alias: config.alias,
              driver: config.driver as "mysql" | "sqlite" | "postgres",
              dataSourceName: config.dataSourceName,
            },
          ],
        },
      },
    });
  }

  /**
   * if not selected, return the first connection config
   * @param context
   * @returns
   */
  public static async getCurrentConnectionConfig(
    context: vscode.ExtensionContext
  ): Promise<ConnectionConfig | undefined> {
    const defaultAlias = context.globalState.get<string | undefined>(
      ConnectionConfigManager.DefaultConnectionConfigKey
    );
    if (defaultAlias) {
      return this.getConnectionConfig(context, defaultAlias);
    }
    for (const key of context.globalState.keys()) {
      if (key.startsWith("sqls.conn.alias.")) {
        const config = this.getConnectionConfig(context, key);
        if (!config) {
          continue;
        }

        return config;
      }
    }
    return undefined;
  }
}
