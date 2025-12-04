import * as vscode from "vscode";
import { SqlsClient } from "./lspClient";
import { InitializeOptions } from "./initialize";
import { ResultPanel } from "./resultPanel";

const clientTraceName = "Sqls Next Client";
const SqlsResultPanelViewType = "sqlsResultPanel";

let lspClient: SqlsClient | undefined;
let traceOutputChannel: vscode.OutputChannel | undefined;
let resultPanel: ResultPanel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  createResultPanel(context);
  createLspClient(context);

  const initializationOptions: InitializeOptions = {
    connectionConfig: {
      alias: "default",
      driver: "mysql",
      dataSourceName: "root:root@tcp(127.0.0.1:3306)/test",
    },
  };
  startLanguageServer(initializationOptions);
}

export function deactivate() {
  lspClient?.stopServer();
  lspClient = undefined;
  resultPanel?.dispose();
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
  traceOutputChannel = vscode.window.createOutputChannel(clientTraceName);
  lspClient = new SqlsClient(context, traceOutputChannel, resultPanel!);

  const restartLanguageServerCommand = vscode.commands.registerCommand(
    "sqls-next.restartLanguageServer",
    restartLanguageServer
  );
  context.subscriptions.push(restartLanguageServerCommand);
}
