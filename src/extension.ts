import * as vscode from "vscode";
import { SqlsClient } from "./client";
import { InitializeOptions } from "./initialize";

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

  const initializationOptions: InitializeOptions = {
    connectionConfig: {
      alias: "default",
      driver: "mysql",
      dataSourceName: "",
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
