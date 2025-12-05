import * as vscode from "vscode";

export class OutputLogger {
  private static outputChannel: vscode.OutputChannel | undefined;

  public static initialize(context: vscode.ExtensionContext, name: string) {
    this.outputChannel = vscode.window.createOutputChannel(name);
    context.subscriptions.push(this.outputChannel);
  }

  public static getOutputChannel(): vscode.OutputChannel | undefined {
    return this.outputChannel;
  }

  public static info(message: string, modules: string | null = null) {
    this.log("INFO", modules, message);
  }

  public static warn(message: string, modules: string | null = null) {
    this.log("WARN", modules, message);
  }

  public static error(message: string, modules: string | null = null) {
    this.log("ERROR", modules, message);
  }

  public static errorWithStackTrace(
    message: string,
    error: Error,
    modules: string | null = null
  ) {
    this.log("ERROR", modules, message + "\n" + error.stack || "");
  }

  public static debug(message: string, modules: string | null = null) {
    this.log("DEBUG", modules, message);
  }

  private static log(level: string, modules: string | null, message: string) {
    if (this.outputChannel) {
      const timestamp = new Date().toISOString();
      if (modules) {
        this.outputChannel.appendLine(
          `[${timestamp}] [${level}] [${modules}] ${message}`
        );
      } else {
        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
      }
    }
  }

  public static show() {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }
}
