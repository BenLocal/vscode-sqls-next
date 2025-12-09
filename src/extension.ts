import * as vscode from "vscode";
import { SqlsClient } from "./lspClient";
import { InitializeOptions } from "./lspTypes";
import { ResultPanel } from "./resultPanel";
import { addDatabaseCommand } from "./database";
import { OutputLogger } from "./outputLogger";
import { SqlsTreeView } from "./treeView";

const clientTraceName = "Sqls Next Client";
const SqlsResultPanelViewType = "sqlsResultPanel";

let lspClient: SqlsClient | undefined;
let resultPanel: ResultPanel | undefined;
let treeView: SqlsTreeView | undefined;

export async function activate(context: vscode.ExtensionContext) {
  OutputLogger.initialize(context, clientTraceName);
  createResultPanel(context);
  createLspClient(context);
  addDatabaseCommand(context, lspClient!);
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
