import * as vscode from "vscode";
import { SqlsClient } from "./lspClient";
import { InitializeOptions } from "./lspTypes";
import { ResultPanel } from "./resultPanel";
import { registerDatabaseCommands } from "./database";
import { OutputLogger } from "./outputLogger";
import { SqlsTreeView } from "./treeView";

const clientTraceName = "Sqls Next Client";
const SqlsResultPanelViewType = "sqlsResultPanel";

let lspClient: SqlsClient | undefined;
let resultPanel: ResultPanel | undefined;
let treeView: SqlsTreeView | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

export async function activate(context: vscode.ExtensionContext) {
  OutputLogger.initialize(context, clientTraceName);
  createStatusBarItem(context);
  createResultPanel(context);
  createLspClient(context);
  registerDatabaseCommands(context, lspClient!, resultPanel!);
  treeView = new SqlsTreeView(context, lspClient!);

  let initializationOptions: InitializeOptions = {
    connectionConfig: undefined,
  };
  startLanguageServer(initializationOptions);
}

export function deactivate() {
  lspClient?.stopServer();
  lspClient?.dispose();
  lspClient = undefined;

  resultPanel?.dispose();
  resultPanel = undefined;

  treeView?.dispose();
  treeView = undefined;
}

async function startLanguageServer(initializeOptions: InitializeOptions) {
  await lspClient?.startServer(initializeOptions);
}

async function restartLanguageServer(initializeOptions: InitializeOptions) {
  await lspClient?.restartServer(initializeOptions);
}

async function createResultPanel(context: vscode.ExtensionContext) {
  resultPanel = new ResultPanel(context.extensionUri, SqlsResultPanelViewType);
  const provider = vscode.window.registerWebviewViewProvider(
    SqlsResultPanelViewType,
    resultPanel as vscode.WebviewViewProvider,
    {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }
  );
  context.subscriptions.push(provider);
}

async function createLspClient(context: vscode.ExtensionContext) {
  lspClient = new SqlsClient(context, resultPanel!);

  const restartLanguageServerCommand = vscode.commands.registerCommand(
    "sqls-next.restartLanguageServer",
    restartLanguageServer
  );
  context.subscriptions.push(restartLanguageServerCommand);
}

async function createStatusBarItem(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBarItem.text = "Sqls";
  statusBarItem.tooltip = "Sqls";
  statusBarItem.command = "sqls-next.showLog";

  const showLogCommand = vscode.commands.registerCommand(
    "sqls-next.showLog",
    () => {
      const outputChannel = lspClient?.getOutputChannel();
      if (outputChannel) {
        outputChannel.show();
      } else {
        OutputLogger.show();
      }
    }
  );

  context.subscriptions.push(showLogCommand, statusBarItem);
  statusBarItem.show();
}
