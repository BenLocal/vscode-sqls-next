import * as vscode from "vscode";
import { OutputLogger } from "./outputLogger";

export type MessageType = "error" | "warning" | "info";
export type MessageFilter = (message: string, type: MessageType) => boolean;
export type MessageTransformer = (message: string, type: MessageType) => string;

export interface MessageInterceptorOptions {
  filter?: MessageFilter;
  transformer?: MessageTransformer;
  logMessages?: boolean;
}

/**
 * Intercepts VS Code window messages (showErrorMessage, showWarningMessage, showInformationMessage)
 * to allow filtering and transformation of messages from language servers
 */
export class MessageInterceptor {
  private readonly originalShowErrorMessage: typeof vscode.window.showErrorMessage;
  private readonly originalShowWarningMessage: typeof vscode.window.showWarningMessage;
  private readonly originalShowInformationMessage: typeof vscode.window.showInformationMessage;

  private readonly options: MessageInterceptorOptions;
  private isActive: boolean = false;

  constructor(options: MessageInterceptorOptions = {}) {
    this.options = {
      logMessages: true,
      ...options,
    };

    // Save original methods
    this.originalShowErrorMessage = vscode.window.showErrorMessage;
    this.originalShowWarningMessage = vscode.window.showWarningMessage;
    this.originalShowInformationMessage = vscode.window.showInformationMessage;
  }

  /**
   * Start intercepting messages
   */
  activate(): void {
    if (this.isActive) {
      return;
    }
    this.log("Activating message interceptor");
    const windowAny = vscode.window as any;
    windowAny.showErrorMessage = (...args: any[]): any => {
      return this.handleMessage("error", args, this.originalShowErrorMessage);
    };

    // Intercept showWarningMessage
    windowAny.showWarningMessage = (...args: any[]): any => {
      return this.handleMessage(
        "warning",
        args,
        this.originalShowWarningMessage
      );
    };

    // Intercept showInformationMessage
    windowAny.showInformationMessage = (...args: any[]): any => {
      return this.handleMessage(
        "info",
        args,
        this.originalShowInformationMessage
      );
    };

    this.isActive = true;
  }

  /**
   * Stop intercepting messages and restore original methods
   */
  deactivate(): void {
    if (!this.isActive) {
      return;
    }

    this.log("Deactivating message interceptor");

    const windowAny = vscode.window as any;
    windowAny.showErrorMessage = this.originalShowErrorMessage;
    windowAny.showWarningMessage = this.originalShowWarningMessage;
    windowAny.showInformationMessage = this.originalShowInformationMessage;

    this.isActive = false;
  }

  /**
   * Update filter function
   */
  setFilter(filter: MessageFilter): void {
    this.options.filter = filter;
  }

  /**
   * Update transformer function
   */
  setTransformer(transformer: MessageTransformer): void {
    this.options.transformer = transformer;
  }

  private handleMessage(
    type: MessageType,
    args: any[],
    originalMethod: Function
  ): any {
    const message = args[0] as string;

    // Log the intercepted message
    if (this.options.logMessages) {
      this.log(`[${type.toUpperCase()}] ${message}`);
    }

    // Apply filter
    if (this.options.filter && !this.options.filter(message, type)) {
      this.log(`Message filtered: ${message}`);
      // Return a resolved promise with undefined to maintain API compatibility
      return Promise.resolve(undefined);
    }

    // Apply transformer
    let transformedMessage = message;
    if (this.options.transformer) {
      transformedMessage = this.options.transformer(message, type);
      if (transformedMessage !== message) {
        this.log(
          `Message transformed: "${message}" -> "${transformedMessage}"`
        );
      }
    }
    const newArgs = [transformedMessage, ...args.slice(1)];
    return originalMethod.apply(vscode.window, newArgs);
  }

  private log(message: string): void {
    OutputLogger.info(message, "MessageInterceptor");
  }
}

/**
 * Create a message filter that suppresses specific messages
 */
export function createMessageFilter(
  patterns: (string | RegExp)[]
): MessageFilter {
  return (message: string, _type: MessageType): boolean => {
    for (const pattern of patterns) {
      if (typeof pattern === "string") {
        if (message.includes(pattern)) {
          return false;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(message)) {
          return false;
        }
      }
    }
    return true;
  };
}

/**
 * Create a message transformer that replaces text in messages
 */
export function createMessageTransformer(
  replacements: Array<{ from: string | RegExp; to: string }>
): MessageTransformer {
  return (message: string, _type: MessageType): string => {
    let result = message;
    for (const replacement of replacements) {
      result = result.replace(replacement.from, replacement.to);
    }
    return result;
  };
}
