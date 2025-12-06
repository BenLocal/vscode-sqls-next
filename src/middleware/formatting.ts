import * as vscode from "vscode";
import * as lsp from "vscode-languageclient/node";

export class SqlsFormattingMiddleware implements lsp.FormattingMiddleware {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  provideDocumentFormattingEdits(
    _document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    return null;
  }

  provideDocumentRangeFormattingEdits(
    _document: vscode.TextDocument,
    _range: vscode.Range,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    return null;
  }

  provideOnTypeFormattingEdits(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    _ch: string,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    return null;
  }
}
