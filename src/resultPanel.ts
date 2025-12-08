import path from "node:path";
import fs from "node:fs";
import * as vscode from "vscode";

// Type definitions for query results
export interface QueryResult {
  columns: Array<{ name: string; type?: string }>;
  rows: Array<Record<string, any>>;
  rowsAffected?: number;
  executionTime?: number;
}

export class ResultPanel implements vscode.WebviewViewProvider {
  private readonly _viewType: string;
  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];
  private _template?: string;

  constructor(extensionUri: vscode.Uri, viewType: string) {
    this._extensionUri = extensionUri;
    this._viewType = viewType;
  }

  private async show() {
    await vscode.commands.executeCommand(this._viewType + ".focus");
    this._view?.show(true);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    if (!this._template) {
      this._template = this._getHtmlForWebview(webviewView.webview);
    }

    // Set the webview's initial html content
    webviewView.webview.html = this._template || "";

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case "ready":
            // Webview is ready
            break;
          case "exportCsv":
            this._exportToCsv(message.data);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public async displayResults(results: QueryResult) {
    await this.show();
    if (this._view) {
      this._view.webview.postMessage({
        type: "displayResults",
        data: results,
      });
    }
  }

  public async displayError(error: string) {
    await this.show();
    if (this._view) {
      this._view.webview.postMessage({
        type: "displayError",
        error: error,
      });
    }
  }

  public async displayLoading(message: string = "Executing query...") {
    await this.show();
    if (this._view) {
      this._view.webview.postMessage({
        type: "displayLoading",
        message: message,
      });
    }
  }

  public dispose() {
    this._view = undefined;

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _exportToCsv(data: QueryResult) {
    if (!data?.rows || data.rows.length === 0) {
      vscode.window.showWarningMessage("No data to export");
      return;
    }

    // Convert to CSV
    const headers = data.columns.map((col) => col.name).join(",");
    const rows = data.rows
      .map((row) => {
        return data.columns
          .map((col) => {
            const value = row[col.name];
            // Escape quotes and wrap in quotes if contains comma
            if (value === null || value === undefined) {
              return "";
            }
            const stringValue = String(value);
            if (stringValue.includes(",") || stringValue.includes('"')) {
              return `"${stringValue.replaceAll('"', '""')}"`;
            }
            return stringValue;
          })
          .join(",");
      })
      .join("\n");

    const csv = `${headers}\n${rows}`;

    // Save to file
    vscode.window
      .showSaveDialog({
        filters: {
          CSV: ["csv"],
        },
        defaultUri: vscode.Uri.file("query_results.csv"),
      })
      .then((uri) => {
        if (uri) {
          vscode.workspace.fs.writeFile(uri, Buffer.from(csv, "utf8"));
          vscode.window.showInformationMessage(
            `Results exported to ${uri.fsPath}`
          );
        }
      });
  }

  private _getHtmlForWebview(_webview: vscode.Webview) {
    const templatePath = path.join(this._extensionUri.fsPath, "template", "resultPanel.html");
    return fs.readFileSync(templatePath, "utf8");
  }
}
