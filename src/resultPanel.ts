import * as vscode from "vscode";

// Type definitions for query results
export interface QueryResult {
  columns: Array<{ name: string; type?: string }>;
  rows: Array<Record<string, any>>;
  rowsAffected?: number;
  executionTime?: number;
}

export class ResultPanel implements vscode.WebviewViewProvider {
  private static currentPanel: ResultPanel | undefined;
  private _view?: vscode.WebviewView;
  private readonly _extensionUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];

  public static readonly viewType = "sqlsResultPanel";

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  public static getCurrentPanel(): ResultPanel | undefined {
    return ResultPanel.currentPanel;
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    // If we already have a panel, show it
    if (ResultPanel.currentPanel) {
      ResultPanel.currentPanel._view?.show(true);
      return ResultPanel.currentPanel;
    }

    // Otherwise, create a new panel
    ResultPanel.currentPanel = new ResultPanel(extensionUri);
    return ResultPanel.currentPanel;
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

    // Set the webview's initial html content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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

  public displayResults(results: QueryResult) {
    if (this._view) {
      this._view.webview.postMessage({
        type: "displayResults",
        data: results,
      });
      this._view.show(true);
    }
  }

  public displayError(error: string) {
    if (this._view) {
      this._view.webview.postMessage({
        type: "displayError",
        error: error,
      });
      this._view.show(true);
    }
  }

  public displayLoading(message: string = "Executing query...") {
    if (this._view) {
      this._view.webview.postMessage({
        type: "displayLoading",
        message: message,
      });
      this._view.show(true);
    }
  }

  public dispose() {
    ResultPanel.currentPanel = undefined;

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

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Results</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            margin-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .info {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }

        .actions {
            display: flex;
            gap: 8px;
        }

        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 13px;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .table-container {
            flex: 1;
            overflow: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        thead {
            position: sticky;
            top: 0;
            background-color: var(--vscode-editor-background);
            z-index: 10;
        }

        th {
            text-align: left;
            padding: 10px 12px;
            font-weight: 600;
            border-bottom: 2px solid var(--vscode-panel-border);
            background-color: var(--vscode-list-hoverBackground);
            white-space: nowrap;
        }

        td {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            max-width: 400px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        tr:nth-child(even) {
            background-color: var(--vscode-list-inactiveSelectionBackground);
        }

        .null-value {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 400px;
            color: var(--vscode-descriptionForeground);
        }

        .spinner {
            border: 3px solid var(--vscode-panel-border);
            border-top: 3px solid var(--vscode-button-background);
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin-bottom: 16px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .error {
            padding: 16px;
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            color: var(--vscode-inputValidation-errorForeground);
            margin-top: 16px;
        }

        .error-title {
            font-weight: 600;
            margin-bottom: 8px;
        }

        .empty {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="content">
            <div class="empty">
                Execute a SQL query to see results here
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Send ready message
        vscode.postMessage({ type: 'ready' });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'displayResults':
                    displayResults(message.data);
                    break;
                case 'displayError':
                    displayError(message.error);
                    break;
                case 'displayLoading':
                    displayLoading(message.message);
                    break;
            }
        });

        function displayLoading(message) {
            document.getElementById('content').innerHTML = \`
                <div class="loading">
                    <div class="spinner"></div>
                    <div>\${message}</div>
                </div>
            \`;
        }

        function displayError(error) {
            document.getElementById('content').innerHTML = \`
                <div class="error">
                    <div class="error-title">Error executing query</div>
                    <div>\${escapeHtml(error)}</div>
                </div>
            \`;
        }

        function displayResults(data) {
            if (!data || !data.rows || data.rows.length === 0) {
                document.getElementById('content').innerHTML = \`
                    <div class="empty">No results found</div>
                \`;
                return;
            }

            const rowCount = data.rows.length;
            const columnCount = data.columns.length;

            let html = \`
                <div class="toolbar">
                    <div class="info">
                        \${rowCount} row\${rowCount !== 1 ? 's' : ''} × \${columnCount} column\${columnCount !== 1 ? 's' : ''}
                    </div>
                    <div class="actions">
                        <button onclick="exportToCsv()">Export to CSV</button>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
            \`;

            // Add headers
            data.columns.forEach(col => {
                html += \`<th>\${escapeHtml(col.name)}</th>\`;
            });

            html += \`
                            </tr>
                        </thead>
                        <tbody>
            \`;

            // Add rows
            data.rows.forEach(row => {
                html += '<tr>';
                data.columns.forEach(col => {
                    const value = row[col.name];
                    if (value === null || value === undefined) {
                        html += '<td class="null-value">NULL</td>';
                    } else {
                        html += \`<td title="\${escapeHtml(String(value))}">\${escapeHtml(String(value))}</td>\`;
                    }
                });
                html += '</tr>';
            });

            html += \`
                        </tbody>
                    </table>
                </div>
            \`;

            document.getElementById('content').innerHTML = html;

            // Store data for export
            window.currentData = data;
        }

        function exportToCsv() {
            if (window.currentData) {
                vscode.postMessage({
                    type: 'exportCsv',
                    data: window.currentData
                });
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
  }
}
