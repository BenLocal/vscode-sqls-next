import * as vscode from "vscode";
import { SqlsClient } from "./client";

const clientTraceName = "Sqls Next Client";

let client: SqlsClient | undefined;
let traceOutputChannel: vscode.OutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  traceOutputChannel = vscode.window.createOutputChannel(clientTraceName);
  client = new SqlsClient(context, traceOutputChannel);

  const restartLanguageServerCommand = vscode.commands.registerCommand(
    "sqls-next.restartLanguageServer",
    restartLanguageServer
  );
  context.subscriptions.push(restartLanguageServerCommand);
  startLanguageServer();
}

export function deactivate() {
  client?.stopServer();
  client = undefined;
}

async function startLanguageServer() {
  await client?.startServer();
}

async function restartLanguageServer() {
  await client?.restartServer();
}
