import * as vscode from "vscode";
import { ConnectionConfig, ConnectionConfigManager } from "./database";
import { SqlsClient } from "./lspClient";

export class SqlsTreeView {
  private readonly _context: vscode.ExtensionContext;
  private readonly _lspClient: SqlsClient;
  private readonly _treeView: vscode.TreeView<any>;

  constructor(context: vscode.ExtensionContext, lspClient: SqlsClient) {
    this._context = context;
    this._lspClient = lspClient;
    this._treeView = this._initTreeView();
    this._context.subscriptions.push(this._treeView);
  }

  private _initTreeView(): vscode.TreeView<any> {
    const treeViewOptions: vscode.TreeViewOptions<any> = {
      treeDataProvider: new DatabaseTreeDataProvider(this._context, this._lspClient),
      showCollapseAll: true
    };
    return vscode.window.createTreeView("sqlsExplorer", treeViewOptions);
  }

  public get treeView(): vscode.TreeView<any> {
    return this._treeView;
  }

  public dispose() {
    this._treeView.dispose();
  }
}

interface TreeElement {
  key: string;
  currentType: "conn" | "database" | "table";
  childrenType?: "database" | "table";
  config?: ConnectionConfig;
  database?: string;
}

class DatabaseTreeDataProvider implements vscode.TreeDataProvider<TreeElement> {
  constructor(private readonly context: vscode.ExtensionContext,
    private readonly lspClient: SqlsClient) { }

  async getChildren(element: TreeElement): Promise<TreeElement[]> {
    return await this._getChildren(element);
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return this._getTreeItem(element);
  }

  _getTreeItem(element: TreeElement): vscode.TreeItem {
    let currentType = element?.currentType ?? "conn";

    switch (currentType) {
      case "conn":
        return new vscode.TreeItem(element.key, vscode.TreeItemCollapsibleState.Collapsed);
      case "database":
        return new vscode.TreeItem(element.key, vscode.TreeItemCollapsibleState.Collapsed);
      case "table":
        return new vscode.TreeItem(element.key, vscode.TreeItemCollapsibleState.None);
    }
  }

  async _getChildren(element: TreeElement | undefined): Promise<TreeElement[]> {
    if (!element) {
      return await this._getConnChildren();
    }

    const type = element.childrenType;
    switch (type) {
      case "database":
        return await this._getDatabaseChildren(element.config);
      case "table":
        return await this._getTableChildren(element.config, element.key);
    }

    return [];
  }

  async _getConnChildren(): Promise<TreeElement[]> {
    const configs = await ConnectionConfigManager.getConnectionConfigs(this.context);
    return configs.map(config => {
      let childrenType = "database";
      if (config.config.driver === "sqlite3") {
        childrenType = "table";
      }
      return {
        key: config.config.alias,
        currentType: "conn",
        childrenType: childrenType as "database" | "table",
        config: config.config
      };
    });
  }

  async _getDatabaseChildren(config: ConnectionConfig | undefined): Promise<TreeElement[]> {
    if (!config) {
      return [];
    }
    const databases = await this.lspClient.getDatabases(config.alias);
    return databases.map(database => ({
      key: database,
      currentType: "database",
      childrenType: "table",
      config: config
    }));
  }

  async _getTableChildren(config: ConnectionConfig | undefined, database: string): Promise<TreeElement[]> {
    if (!config) {
      return [];
    }
    const alias = config.alias;
    const tables = await this.lspClient.getTables(alias, database);
    return tables.map(table => ({
      key: table,
      currentType: "table",
      config: config,
      database: database
    }));
  }
}


