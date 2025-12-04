import * as vscode from "vscode";
import { SqlsClient } from "./client";
import { InitializeOptions } from "./initialize";
import { ResultPanel } from "./resultPanel";

const clientTraceName = "Sqls Next Client";

let client: SqlsClient | undefined;
let traceOutputChannel: vscode.OutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  traceOutputChannel = vscode.window.createOutputChannel(clientTraceName);
  client = new SqlsClient(context, traceOutputChannel);

  // Register webview view provider for result panel
  const resultPanel = ResultPanel.createOrShow(context.extensionUri);
  const provider = vscode.window.registerWebviewViewProvider(
    ResultPanel.viewType,
    resultPanel
  );
  context.subscriptions.push(provider);

  const restartLanguageServerCommand = vscode.commands.registerCommand(
    "sqls-next.restartLanguageServer",
    restartLanguageServer
  );
  context.subscriptions.push(restartLanguageServerCommand);

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
  client?.stopServer();
  client = undefined;
}

async function startLanguageServer(initializeOptions: InitializeOptions) {
  await client?.startServer(initializeOptions);
}

async function restartLanguageServer(initializeOptions: InitializeOptions) {
  await client?.restartServer(initializeOptions);
}
