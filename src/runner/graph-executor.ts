// Graph Execution Engine for Deno
// Supports HTTP requests, conditions, string interpolation, and custom functions

import * as YAML from "yaml";

interface Config {
  verbose: boolean;
  http: {
    base_url: string;
    headers: Record<string, string>;
  };
}

interface HttpExecutor {
  type: "http";
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  body?: any;
  mutate?: string;
  headers?: Record<string, string>;
}

interface SleepExecutor {
  type: "sleep";
  value: number;
}

interface NoneExecutor {
  type: "none";
}

interface EndExecutor {
  type: "end";
  code?: number; // Optional exit code (defaults to 0)
}

type Executor = HttpExecutor | SleepExecutor | NoneExecutor | EndExecutor;

interface SimpleCondition {
  path: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=";
  value: any;
}

interface AndCondition {
  and: (SimpleCondition | AndCondition | OrCondition)[];
}

interface OrCondition {
  or: (SimpleCondition | AndCondition | OrCondition)[];
}

type Condition = SimpleCondition | AndCondition | OrCondition;

interface Edge {
  to: string;
  condition?: Condition | string;
  fallback?: string;
}

interface Node {
  description?: string;
  executor: Executor;
  edges?: Edge[];
  type?: "end";
  code?: number; // Optional exit code for end nodes (defaults to 0)
}

interface BeforeHook {
  executor: Executor;
}

interface BeforeConfig {
  all?: Record<string, BeforeHook>;
  start?: Record<string, BeforeHook>;
  // Legacy support: direct hooks (treated as 'all')
  [key: string]: Record<string, BeforeHook> | BeforeHook | undefined;
}

interface GraphConfig {
  initialState: Record<string, any>;
  config: Config;
  variables?: Record<string, any>;
  before?: BeforeConfig;
  conditions?: Record<string, Condition>;
  graph: Record<string, Node>;
}

// Custom functions for string interpolation
const customFunctions = {
  min: (a: number, b: number): number => Math.min(a, b),
  max: (a: number, b: number): number => Math.max(a, b),
  // Add more custom functions as needed
};

// AST Node types for expression parsing
interface ASTNode {
  type: string;
}

interface IdentifierNode extends ASTNode {
  type: "identifier";
  name: string;
}

interface LiteralNode extends ASTNode {
  type: "literal";
  value: string | number | boolean | null;
}

interface ObjectNode extends ASTNode {
  type: "object";
  properties: Array<{ key: string; value: ASTNode }>;
}

interface MemberAccessNode extends ASTNode {
  type: "member_access";
  object: ASTNode;
  property: string;
}

interface ArrayAccessNode extends ASTNode {
  type: "array_access";
  object: ASTNode;
  index: ASTNode;
}

interface FunctionCallNode extends ASTNode {
  type: "function_call";
  name: string;
  arguments: ASTNode[];
}

interface MethodCallNode extends ASTNode {
  type: "method_call";
  object: ASTNode;
  method: string;
  arguments: ASTNode[];
}

type ExpressionNode =
  | IdentifierNode
  | LiteralNode
  | ObjectNode
  | MemberAccessNode
  | ArrayAccessNode
  | FunctionCallNode
  | MethodCallNode;

// Token types for lexical analysis
interface Token {
  type: string;
  value: string;
  position: number;
}

// Tokenizer for expression parsing
class ExpressionTokenizer {
  private input: string;
  private position: number;
  private tokens: Token[];

  constructor(input: string) {
    this.input = input;
    this.position = 0;
    this.tokens = [];
  }

  tokenize(): Token[] {
    while (this.position < this.input.length) {
      this.skipWhitespace();

      if (this.position >= this.input.length) break;

      const char = this.input[this.position];

      if (char === "(") {
        this.addToken("LPAREN", "(");
      } else if (char === ")") {
        this.addToken("RPAREN", ")");
      } else if (char === "{") {
        this.addToken("LBRACE", "{");
      } else if (char === "}") {
        this.addToken("RBRACE", "}");
      } else if (char === ".") {
        this.addToken("DOT", ".");
      } else if (char === ",") {
        this.addToken("COMMA", ",");
      } else if (char === ":") {
        this.addToken("COLON", ":");
      } else if (char === "[") {
        this.addToken("LBRACKET", "[");
      } else if (char === "]") {
        this.addToken("RBRACKET", "]");
      } else if (char === '"' || char === "'") {
        this.tokenizeString();
      } else if (this.isDigit(char)) {
        this.tokenizeNumber();
      } else if (this.isAlpha(char) || char === "_") {
        this.tokenizeIdentifier();
      } else {
        throw new Error(
          `Unexpected character '${char}' at position ${this.position}`,
        );
      }
    }

    this.addToken("EOF", "");
    return this.tokens;
  }

  private addToken(type: string, value: string) {
    this.tokens.push({ type, value, position: this.position });
    this.position += value.length;
  }

  private skipWhitespace() {
    while (
      this.position < this.input.length && /\s/.test(this.input[this.position])
    ) {
      this.position++;
    }
  }

  private tokenizeString() {
    const quote = this.input[this.position];
    let value = "";
    this.position++; // Skip opening quote

    while (
      this.position < this.input.length && this.input[this.position] !== quote
    ) {
      if (this.input[this.position] === "\\") {
        this.position++; // Skip escape character
        if (this.position < this.input.length) {
          value += this.input[this.position];
        }
      } else {
        value += this.input[this.position];
      }
      this.position++;
    }

    if (this.position >= this.input.length) {
      throw new Error(
        `Unterminated string literal starting at position ${
          this.position - value.length - 1
        }`,
      );
    }

    this.position++; // Skip closing quote
    this.tokens.push({ type: "STRING", value, position: this.position });
  }

  private tokenizeNumber() {
    let value = "";
    while (
      this.position < this.input.length &&
      (this.isDigit(this.input[this.position]) ||
        this.input[this.position] === ".")
    ) {
      value += this.input[this.position];
      this.position++;
    }
    this.tokens.push({ type: "NUMBER", value, position: this.position });
  }

  private tokenizeIdentifier() {
    let value = "";
    while (
      this.position < this.input.length &&
      (this.isAlphaNumeric(this.input[this.position]) ||
        this.input[this.position] === "_")
    ) {
      value += this.input[this.position];
      this.position++;
    }

    // Check for keywords
    const type = ["true", "false", "null"].includes(value)
      ? "KEYWORD"
      : "IDENTIFIER";
    this.tokens.push({ type, value, position: this.position });
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z]/.test(char);
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}

// Parser for building AST from tokens
class ExpressionParser {
  private tokens: Token[];
  private current: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.current = 0;
  }

  parse(): ExpressionNode {
    return this.parseExpression();
  }

  private parseExpression(): ExpressionNode {
    return this.parsePostfixExpression();
  }

  private parsePostfixExpression(): ExpressionNode {
    let node = this.parsePrimary();

    while (
      !this.isAtEnd() &&
      (this.peek().type === "DOT" || this.peek().type === "LPAREN" ||
        this.peek().type === "LBRACKET")
    ) {
      if (this.match("DOT")) {
        const property = this.consume(
          "IDENTIFIER",
          'Expected property name after "."',
        );

        // Check if this is a method call (property followed by parentheses)
        if (this.check("LPAREN")) {
          this.advance(); // consume '('
          const args = this.parseArguments();
          this.consume("RPAREN", 'Expected ")" after arguments');

          node = {
            type: "method_call",
            object: node,
            method: property.value,
            arguments: args,
          };
        } else {
          node = {
            type: "member_access",
            object: node,
            property: property.value,
          };
        }
      } else if (this.match("LPAREN")) {
        // Function call on current node
        if (node.type !== "identifier") {
          throw new Error("Only identifiers can be called as functions");
        }

        const args = this.parseArguments();
        this.consume("RPAREN", 'Expected ")" after arguments');

        node = {
          type: "function_call",
          name: (node as IdentifierNode).name,
          arguments: args,
        };
      } else if (this.match("LBRACKET")) {
        // Array access
        const index = this.parseExpression();
        this.consume("RBRACKET", 'Expected "]" after array index');

        node = {
          type: "array_access",
          object: node,
          index: index,
        };
      }
    }

    return node;
  }

  private parsePrimary(): ExpressionNode {
    if (this.match("STRING")) {
      return {
        type: "literal",
        value: this.previous().value,
      };
    }

    if (this.match("NUMBER")) {
      return {
        type: "literal",
        value: parseFloat(this.previous().value),
      };
    }

    if (this.match("KEYWORD")) {
      const keyword = this.previous().value;
      let value: any;
      if (keyword === "true") value = true;
      else if (keyword === "false") value = false;
      else if (keyword === "null") value = null;

      return {
        type: "literal",
        value,
      };
    }

    if (this.match("IDENTIFIER")) {
      return {
        type: "identifier",
        name: this.previous().value,
      };
    }

    if (this.match("LBRACE")) {
      return this.parseObject();
    }

    if (this.match("LPAREN")) {
      const expr = this.parseExpression();
      this.consume("RPAREN", 'Expected ")" after expression');
      return expr;
    }

    throw new Error(
      `Unexpected token: ${this.peek().value} at position ${this.peek().position}`,
    );
  }

  private parseObject(): ObjectNode {
    const properties: Array<{ key: string; value: ExpressionNode }> = [];

    if (!this.check("RBRACE")) {
      do {
        // Parse key (can be string or identifier)
        let key: string;
        if (this.check("STRING")) {
          key = this.advance().value;
        } else if (this.check("IDENTIFIER")) {
          key = this.advance().value;
        } else {
          throw new Error("Expected property name");
        }

        this.consume("COLON", 'Expected ":" after property name');
        const value = this.parseExpression();

        properties.push({ key, value });
      } while (this.match("COMMA"));
    }

    this.consume("RBRACE", 'Expected "}" after object properties');

    return {
      type: "object",
      properties,
    };
  }

  private parseArguments(): ExpressionNode[] {
    const args: ExpressionNode[] = [];

    if (!this.check("RPAREN")) {
      do {
        args.push(this.parseExpression());
      } while (this.match("COMMA"));
    }

    return args;
  }

  // Utility methods
  private match(...types: string[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: string): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: string, message: string): Token {
    if (this.check(type)) return this.advance();
    throw new Error(
      `${message}. Got ${this.peek().type} at position ${this.peek().position}`,
    );
  }
}

// AST Evaluator
class ExpressionEvaluator {
  private context: Record<string, any>;

  constructor(context: Record<string, any>) {
    this.context = context;
  }

  evaluate(node: ExpressionNode): any {
    switch (node.type) {
      case "literal":
        return (node as LiteralNode).value;

      case "identifier":
        const identifier = node as IdentifierNode;
        return this.context[identifier.name];

      case "object":
        const objectNode = node as ObjectNode;
        const obj: Record<string, any> = {};
        for (const prop of objectNode.properties) {
          obj[prop.key] = this.evaluate(prop.value as ExpressionNode);
        }
        return obj;

      case "member_access":
        const memberNode = node as MemberAccessNode;
        const object = this.evaluate(memberNode.object as ExpressionNode);
        if (object === null || object === undefined) {
          return undefined;
        }

        // Check if it's a special path function that can be called as property
        if (Array.isArray(object) && pathFunctions[memberNode.property as keyof typeof pathFunctions]) {
          const pathFunc = pathFunctions[memberNode.property as keyof typeof pathFunctions];
          // For first/last functions that don't need arguments
          if (memberNode.property === 'first' || memberNode.property === 'last') {
            return (pathFunc as any)(object);
          }
        }

        return object[memberNode.property];

      case "array_access":
        const arrayNode = node as ArrayAccessNode;
        const arrayObject = this.evaluate(arrayNode.object as ExpressionNode);
        if (arrayObject === null || arrayObject === undefined) {
          return undefined;
        }
        const index = this.evaluate(arrayNode.index as ExpressionNode);
        if (Array.isArray(arrayObject)) {
          return arrayObject[index];
        } else if (typeof arrayObject === "object") {
          // Support object property access with bracket notation
          return arrayObject[index];
        }
        return undefined;

      case "function_call":
        const funcNode = node as FunctionCallNode;
        const func =
          customFunctions[funcNode.name as keyof typeof customFunctions];
        if (!func || typeof func !== "function") {
          throw new Error(`Unknown function: ${funcNode.name}`);
        }
        const args = funcNode.arguments.map((arg) => this.evaluate(arg as ExpressionNode));
        return (func as any)(...args);

      case "method_call":
        const methodNode = node as MethodCallNode;
        const target = this.evaluate(methodNode.object as ExpressionNode);
        if (target === null || target === undefined) {
          throw new Error(
            `Cannot call method '${methodNode.method}' on ${target}`,
          );
        }

        // Check if it's a special path function like 'find'
        if (pathFunctions[methodNode.method as keyof typeof pathFunctions]) {
          const pathFunc =
            pathFunctions[methodNode.method as keyof typeof pathFunctions];
          const methodArgs = methodNode.arguments.map((arg) =>
            this.evaluate(arg as ExpressionNode)
          );
          return (pathFunc as any)(target, ...methodArgs);
        }

        // Regular method call
        const method = target[methodNode.method];
        if (typeof method !== "function") {
          throw new Error(
            `'${methodNode.method}' is not a function on ${typeof target}`,
          );
        }
        const methodArgs = methodNode.arguments.map((arg) =>
          this.evaluate(arg as ExpressionNode)
        );
        return method.apply(target, methodArgs);

      default:
        throw new Error(`Unknown AST node type: ${(node as ASTNode).type}`);
    }
  }
}

// Custom functions for path evaluation
const pathFunctions = {
  find: (
    array: any[],
    searchCriteria?: string | Record<string, any>,
    propertyName?: string,
  ): any => {
    if (!Array.isArray(array)) {
      return undefined;
    }

    return array.find((item) => {
      // If searchCriteria is an object like {id: 'training'}
      if (typeof searchCriteria === "object" && searchCriteria !== null) {
        // Check if all properties match
        return Object.entries(searchCriteria).every(([key, value]) => {
          return item && typeof item === "object" && item[key] === value;
        });
      }

      // If searchCriteria is a string (legacy behavior)
      if (typeof searchCriteria === "string") {
        // If it's a primitive value, compare directly
        if (typeof item === "string" || typeof item === "number") {
          return item === searchCriteria;
        }

        // If it's an object
        if (typeof item === "object" && item !== null) {
          // If propertyName is specified, search by that property
          if (propertyName) {
            return item[propertyName] === searchCriteria;
          }

          // Otherwise, search common properties (fallback behavior)
          return item.id === searchCriteria ||
            item.name === searchCriteria ||
            item.type === searchCriteria ||
            item.key === searchCriteria;
        }
      }

      return false;
    });
  },
  
  filter: (array: any[], query: Record<string, any>): any[] => {
    if (!Array.isArray(array)) {
      return [];
    }

    return array.filter((item) => {
      // Support MongoDB-style queries like {'salary': {'<=': 100}}
      return Object.entries(query).every(([fieldPath, condition]) => {
        if (!item || typeof item !== "object") {
          return false;
        }

        // Get the field value (support nested paths like 'user.age')
        const fieldValue = fieldPath.split('.').reduce((obj, key) => obj?.[key], item);

        // Handle different condition types
        if (typeof condition === "object" && condition !== null) {
          // MongoDB-style operators: {'<=': 100}, {'!=': 'test'}, etc.
          return Object.entries(condition).every(([operator, value]) => {
            switch (operator) {
              case '<':
              case '$lt':
                return (fieldValue as any) < (value as any);
              case '<=':
              case '$lte':
                return (fieldValue as any) <= (value as any);
              case '>':
              case '$gt':
                return (fieldValue as any) > (value as any);
              case '>=':
              case '$gte':
                return (fieldValue as any) >= (value as any);
              case '!=':
              case '$ne':
                return fieldValue !== value;
              case '==':
              case '$eq':
                return fieldValue === value;
              default:
                throw new Error(`Unknown filter operator: ${operator}`);
            }
          });
        } else {
          // Direct equality comparison
          return fieldValue === condition;
        }
      });
    });
  },

  sort: (array: any[], key: string, direction: 'asc' | 'desc' = 'asc'): any[] => {
    if (!Array.isArray(array)) {
      return [];
    }

    return [...array].sort((a, b) => {
      // Get values using nested path support
      const aValue = key.split('.').reduce((obj, k) => obj?.[k], a);
      const bValue = key.split('.').reduce((obj, k) => obj?.[k], b);

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return direction === 'asc' ? -1 : 1;
      if (bValue == null) return direction === 'asc' ? 1 : -1;

      // Compare values
      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;

      return direction === 'asc' ? comparison : -comparison;
    });
  },

  first: (array: any[]): any => {
    if (!Array.isArray(array) || array.length === 0) {
      return undefined;
    }
    return array[0];
  },

  last: (array: any[]): any => {
    if (!Array.isArray(array) || array.length === 0) {
      return undefined;
    }
    return array[array.length - 1];
  },
  // Add more path functions as needed
};

class GraphExecutor {
  private config: GraphConfig;
  private state: Record<string, any>;
  private running = false;
  private exitCode = 0; // Default exit code

  constructor(config: GraphConfig) {
    this.config = config;
    this.state = { 
      ...config.initialState,
      // Add variables under 'var' namespace for ${var.VAR_NAME} access
      var: { ...config.variables }
    };
  }

  private log(...args: any[]) {
    if (this.config.config.verbose) {
      console.log(`[${new Date().toISOString()}]`, ...args);
    }
  }

  // String interpolation with AST-based expression parsing
  private interpolateString(
    template: string,
    context: Record<string, any>,
  ): string {
    // console.debug("interpolateString template:", template);

    let result = template;

    // First handle ${var.VAR_NAME} syntax for variables
    result = result.replace(/\$\{var\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, varName) => {
      const varValue = context.var?.[varName];
      if (varValue !== undefined) {
        return String(varValue);
      } else {
        this.log(`Warning: Variable "${varName}" not found in variables`);
        return match; // Return original if variable not found
      }
    });

    // Handle ${secret.SECRET_NAME} and ${SECRET.SECRET_NAME} syntax for secrets from container environment variables
    result = result.replace(/\$\{secret\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, secretName) => {
      const secretValue = Deno.env.get(secretName);
      if (secretValue !== undefined) {
        return secretValue;
      } else {
        this.log(`Warning: Secret "${secretName}" not found in container environment`);
        return match; // Return original if secret not found
      }
    });

    result = result.replace(/\$\{SECRET\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, secretName) => {
      const secretValue = Deno.env.get(secretName);
      if (secretValue !== undefined) {
        return secretValue;
      } else {
        this.log(`Warning: Secret "${secretName}" not found in container environment`);
        return match; // Return original if secret not found
      }
    });

    // Then handle {{ ... }} syntax for complex expressions
    let match;
    const regex = /\{\{/g;

    while ((match = regex.exec(result)) !== null) {
      const start = match.index;
      let braceCount = 2; // We found {{
      let end = start + 2;

      // Find the matching }}
      while (end < result.length && braceCount > 0) {
        if (result[end] === "{") {
          braceCount++;
        } else if (result[end] === "}") {
          braceCount--;
        }
        end++;
      }

      if (braceCount === 0) {
        // We found a complete {{ ... }} expression
        const fullMatch = result.substring(start, end);
        const expression = result.substring(start + 2, end - 2).trim();

        try {
          // console.debug("EXPRESSION found:", expression);

          // Parse expression using AST
          const tokenizer = new ExpressionTokenizer(expression);
          const tokens = tokenizer.tokenize();
          // console.debug("Tokens:", tokens);

          const parser = new ExpressionParser(tokens);
          const ast = parser.parse();
          // console.debug("AST:", ast);

          // Create evaluation context with custom functions
          const evalContext = {
            ...context,
            ...customFunctions,
          };

          const evaluator = new ExpressionEvaluator(evalContext);
          const value = evaluator.evaluate(ast);

          // console.debug("AST result:", value);
          result = result.replace(fullMatch, String(value));

          // Adjust regex position since we modified the string
          regex.lastIndex = 0;
        } catch (error) {
          this.log(`Error interpolating "${expression}":`, error);
        }
      }
    }

    return result;
  }

  // Recursively interpolate object properties
  private interpolateObject(obj: any, context: Record<string, any>): any {
    if (typeof obj === "string") {
      // console.debug("obj is string", obj);
      return this.interpolateString(obj, context);
    } else if (Array.isArray(obj)) {
      // console.debug("obj is array", obj);
      return obj.map((item) => this.interpolateObject(item, context));
    } else if (obj && typeof obj === "object") {
      // console.debug("obj is object", obj);
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        // console.debug("KEY/VAL", key, value);
        const interpolatedKey = this.interpolateString(key, context);
        result[interpolatedKey] = this.interpolateObject(value, context);
      }
      return result;
    } else {
      // console.debug("obj is :shrugging", obj);
      return obj;
    }
  }

  // Legacy method kept for condition evaluation - will be replaced eventually
  private getValueByPath(path: string, context: Record<string, any>): any {
    // console.debug("PATH", path);

    // For simple paths without function calls, use direct property access
    if (!path.includes("(") && !path.includes("[")) {
      const parts = path.split(".");
      let current = context;

      for (const part of parts) {
        current = current?.[part];
      }
      return current;
    }

    // For complex expressions, use AST parsing
    try {
      const tokenizer = new ExpressionTokenizer(path);
      const tokens = tokenizer.tokenize();
      const parser = new ExpressionParser(tokens);
      const ast = parser.parse();
      const evaluator = new ExpressionEvaluator({
        ...context,
        ...customFunctions,
      });
      return evaluator.evaluate(ast);
    } catch (error) {
      this.log(`Error evaluating path "${path}":`, error, "Context:", context);
      return undefined;
    }
  }

  // Execute HTTP request
  private async executeHttp(executor: HttpExecutor): Promise<any> {
    const url = this.config.config.http.base_url + executor.endpoint;
    const headers = {
      ...this.config.config.http.headers,
      ...executor.headers,
    };

    // Interpolate URL, headers, and body
    const interpolatedUrl = this.interpolateString(url, this.state);
    const interpolatedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key,
        this.interpolateString(value, this.state),
      ]),
    );

    let body;
    if (executor.body) {
      // console.debug("executor.body", executor.body);
      // Recursively interpolate the body object instead of stringifying first
      body = this.interpolateObject(executor.body, this.state);
    }

    this.log(`HTTP ${executor.method} ${interpolatedUrl}`);
    if (body) {
      this.log("Body:", body);
    } else {
      delete interpolatedHeaders["Content-Type"];
    }

    try {
      const response = await fetch(interpolatedUrl, {
        method: executor.method,
        headers: interpolatedHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json();
      this.log("Response:", JSON.stringify(data));

      if (executor.mutate) {
        this.state[executor.mutate] = data;
        // this.log(`State updated: ${executor.mutate} =`, JSON.stringify(data));
      }

      return data;
    } catch (error) {
      this.log("HTTP Error:", error);
      throw error;
    }
  }

  // Execute sleep
  private async executeSleep(executor: SleepExecutor): Promise<void> {
    this.log(`Sleeping for ${executor.value}ms`);
    await new Promise((resolve) => setTimeout(resolve, executor.value));
  }

  // Evaluate condition
  private evaluateCondition(condition: Condition | string): boolean {
    if (typeof condition === "string") {
      // Named condition
      const namedCondition = this.config.conditions?.[condition];
      if (!namedCondition) {
        throw new Error(`Unknown condition: ${condition}`);
      }
      return this.evaluateCondition(namedCondition);
    }

    // Check if it's a compound condition (and/or)
    if ("and" in condition) {
      return this.evaluateAndCondition(condition as AndCondition);
    }

    if ("or" in condition) {
      return this.evaluateOrCondition(condition as OrCondition);
    }

    // Simple condition
    return this.evaluateSimpleCondition(condition as SimpleCondition);
  }

  // Evaluate AND condition - all conditions must be true
  private evaluateAndCondition(condition: AndCondition): boolean {
    this.log(
      `Evaluating AND condition with ${condition.and.length} sub-conditions`,
    );

    for (let i = 0; i < condition.and.length; i++) {
      const subCondition = condition.and[i];
      const result = this.evaluateCondition(subCondition);
      this.log(`  AND[${i}]: ${result}`);

      if (!result) {
        this.log(`AND condition failed at index ${i}`);
        return false;
      }
    }

    this.log(
      `AND condition passed - all ${condition.and.length} conditions are true`,
    );
    return true;
  }

  // Evaluate OR condition - at least one condition must be true
  private evaluateOrCondition(condition: OrCondition): boolean {
    this.log(
      `Evaluating OR condition with ${condition.or.length} sub-conditions`,
    );

    for (let i = 0; i < condition.or.length; i++) {
      const subCondition = condition.or[i];
      const result = this.evaluateCondition(subCondition);
      this.log(`  OR[${i}]: ${result}`);

      if (result) {
        this.log(`OR condition passed at index ${i}`);
        return true;
      }
    }

    this.log(
      `OR condition failed - none of ${condition.or.length} conditions are true`,
    );
    return false;
  }

  // Evaluate simple condition
  private evaluateSimpleCondition(condition: SimpleCondition): boolean {
    const value = this.getValueByPath(condition.path, this.state);

    // Check if condition.value is a path reference (string starting with a letter/path)
    let compareValue = condition.value;
    if (
      typeof condition.value === "string" && /^[a-zA-Z_]/.test(condition.value)
    ) {
      // Try to resolve as a path first
      const resolvedValue = this.getValueByPath(condition.value, this.state);
      if (resolvedValue !== undefined) {
        compareValue = resolvedValue;
        this.log(
          `Resolved condition value path '${condition.value}' to: ${compareValue}`,
        );
      }
    }

    this.log(
      `Evaluating simple condition: ${condition.path} = ${value} ${condition.operator} ${compareValue}`,
    );

    // Handle undefined/null values more gracefully
    if (value === undefined || value === null) {
      this.log(
        `Warning: Condition path '${condition.path}' resolved to ${value}`,
        "Context:",
        this.state,
      );
      // For numeric comparisons with undefined/null, treat as 0 or false
      switch (condition.operator) {
        case "=":
          return value === compareValue;
        case "!=":
          return value !== compareValue;
        case ">":
        case ">=":
        case "<":
        case "<=":
          // Numeric comparisons with undefined/null should typically be false
          if (typeof compareValue === "number") {
            // Log the specific comparison for debugging
            this.log(
              `Condition failed: ${value} ${condition.operator} ${compareValue} = false (undefined/null treated as failed condition)`,
            );
            return false;
          }
          break;
      }
    }

    switch (condition.operator) {
      case "=":
        return value === compareValue;
      case "!=":
        return value !== compareValue;
      case ">":
        return value > compareValue;
      case "<":
        return value < compareValue;
      case ">=":
        return value >= compareValue;
      case "<=":
        return value <= compareValue;
      default:
        throw new Error(`Unknown operator: ${condition.operator}`);
    }
  }

  // Execute before hooks
  private async executeBefore(type: 'all' | 'start' = 'all'): Promise<void> {
    if (!this.config.before) return;

    this.log(`Executing before hooks (${type})...`);

    // Handle new structure with 'all' and 'start'
    if (this.config.before.all || this.config.before.start) {
      const hooks = type === 'all' ? this.config.before.all : this.config.before.start;
      
      if (hooks) {
        for (const [key, beforeHook] of Object.entries(hooks)) {
          this.log(`Executing ${type} before hook: ${key}`);
          try {
            await this.executeNode(beforeHook.executor, `before:${type}:${key}`);
          } catch (error) {
            this.log(`Error in ${type} before hook ${key}:`, error);
            // Continue with other before hooks even if one fails
          }
        }
      }
    } else {
      // Legacy support: treat direct hooks as 'all' hooks
      if (type === 'all') {
        for (const [key, beforeConfig] of Object.entries(this.config.before)) {
          if (key !== 'all' && key !== 'start' && beforeConfig && 'executor' in beforeConfig) {
            this.log(`Executing legacy before hook: ${key}`);
            try {
              await this.executeNode((beforeConfig as BeforeHook).executor, `before:${key}`);
            } catch (error) {
              this.log(`Error in legacy before hook ${key}:`, error);
              // Continue with other before hooks even if one fails
            }
          }
        }
      }
    }
    // this.log("Current state after before hooks:", JSON.stringify(this.state));
  }

  // Execute a single node's executor
  private async executeNode(
    executor: Executor,
    nodeName?: string,
  ): Promise<any> {
    switch (executor.type) {
      case "http":
        return await this.executeHttp(executor);
      case "sleep":
        return await this.executeSleep(executor);
      case "none":
        this.log(`No-op executor${nodeName ? ` for ${nodeName}` : ""}`);
        return null;
      case "end": {
        const endExecutor = executor as EndExecutor;
        const exitCode = endExecutor.code ?? 0;
        this.exitCode = exitCode;
        this.log(
          `End executor${
            nodeName ? ` for ${nodeName}` : ""
          } with exit code ${exitCode}`,
        );
        this.running = false;
        return null;
      }
      default:
        throw new Error(`Unknown executor type: ${(executor as any).type}`);
    }
  }

  // Find next nodes based on edges and conditions - returns all applicable nodes for sequential execution
  private async findNextNodes(node: Node): Promise<string[]> {
    if (!node.edges || node.edges.length === 0) {
      return [];
    }

    const nextNodes: string[] = [];

    for (const edge of node.edges) {
      if (edge.condition) {
        // Execute 'all' before hooks to refresh state before evaluating condition
        await this.executeBefore('all');

        const conditionMet = this.evaluateCondition(edge.condition);
        this.log(
          `Edge condition result: ${conditionMet} -> ${
            conditionMet ? edge.to : edge.fallback || "no fallback"
          }`,
        );

        if (conditionMet) {
          nextNodes.push(edge.to);
        } else if (edge.fallback) {
          nextNodes.push(edge.fallback);
        }
      } else {
        // No condition, take this edge
        nextNodes.push(edge.to);
      }
    }

    return nextNodes;
  }

  // Main execution loop
  async execute(startNode = "start"): Promise<void> {
    this.running = true;
    let nodeQueue: string[] = [startNode];

    this.log("Starting graph execution...");
    // this.log("Initial state:", this.state);

    // Execute 'start' before hooks once at the very beginning
    await this.executeBefore('start');

    while (this.running && nodeQueue.length > 0) {
      const currentNodeName = nodeQueue.shift()!;
      const node = this.config.graph[currentNodeName];
      if (!node) {
        throw new Error(`Node not found: ${currentNodeName}`);
      }

      this.log(`\n=== Executing node: ${currentNodeName} ===`);
      if (node.description) {
        this.log(`Description: ${node.description}`);
      }

      // Check if this is an end node
      if (node.type === "end") {
        const exitCode = node.code ?? 0;
        this.exitCode = exitCode;
        this.log(
          `Reached end node, stopping execution with exit code ${exitCode}`,
        );
        break;
      }

      try {
        // Execute the node
        await this.executeNode(node.executor, currentNodeName);

        // Find next nodes for sequential execution
        const nextNodes = await this.findNextNodes(node);
        if (nextNodes.length > 0) {
          this.log(`Next nodes: ${nextNodes.join(", ")}`);
          // Add all next nodes to the front of the queue for sequential execution
          nodeQueue.unshift(...nextNodes);
        } else {
          this.log("No next nodes found, continuing with remaining queue");
        }
      } catch (error) {
        this.log(`Error executing node ${currentNodeName}:`, error);
        throw error;
      }
    }

    this.log("\n=== Graph execution completed ===");
    // this.log("Final state:", JSON.stringify(this.state));
    this.log(`Final exit code: ${this.exitCode}`);
  }

  // Stop execution
  stop(): void {
    this.running = false;
    this.log("Graph execution stopped");
  }

  // Get current state
  getState(): Record<string, any> {
    return { ...this.state };
  }

  // Get exit code
  getExitCode(): number {
    return this.exitCode;
  }
}

// Configuration loading utilities
export async function loadConfigFromFile(
  filePath: string,
): Promise<GraphConfig> {
  const content = await Deno.readTextFile(filePath);
  const extension = filePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "yaml":
    case "yml":
      return YAML.parse(content) as GraphConfig;
    case "json":
      return JSON.parse(content) as GraphConfig;
    default:
      throw new Error(
        `Unsupported file extension: ${extension}. Use .yaml, .yml, or .json`,
      );
  }
}

export function loadConfigFromString(
  content: string,
  format: "yaml" | "json",
): GraphConfig {
  switch (format) {
    case "yaml":
      return YAML.parse(content) as GraphConfig;
    case "json":
      return JSON.parse(content) as GraphConfig;
    default:
      throw new Error(`Unsupported format: ${format}. Use 'yaml' or 'json'`);
  }
}

// Auto-detect format from content
export function loadConfigFromStringAuto(content: string): GraphConfig {
  // Try JSON first (more strict)
  try {
    return JSON.parse(content) as GraphConfig;
  } catch {
    // Fallback to YAML
    try {
      return YAML.parse(content) as GraphConfig;
    } catch (error) {
      throw new Error(
        `Failed to parse configuration as JSON or YAML: ${(error as Error).message}`,
      );
    }
  }
}

// Example usage and configuration parser
export function createGraphExecutor(config: GraphConfig): GraphExecutor {
  return new GraphExecutor(config);
}

export function createGraphExecutorFromYaml(
  yamlContent: string,
): GraphExecutor {
  const config = YAML.parse(yamlContent) as GraphConfig;
  return new GraphExecutor(config);
}

export function createGraphExecutorFromJson(
  jsonContent: string,
): GraphExecutor {
  const config = JSON.parse(jsonContent) as GraphConfig;
  return new GraphExecutor(config);
}

// Execute from file
export async function executeFromFile(
  filePath: string,
  startNode?: string,
): Promise<GraphExecutor> {
  const config = await loadConfigFromFile(filePath);
  const executor = new GraphExecutor(config);
  await executor.execute(startNode);
  return executor;
}

// Execute from config object
export async function executeFromConfig(
  config: GraphConfig,
  startNode?: string,
): Promise<GraphExecutor> {
  const executor = new GraphExecutor(config);
  await executor.execute(startNode);
  return executor;
}

// Export main classes and types
export {
  type AndCondition,
  type ArrayAccessNode,
  type Condition,
  type Config,
  customFunctions,
  type Edge,
  type Executor,
  type GraphConfig,
  GraphExecutor,
  type Node,
  type OrCondition,
  pathFunctions,
  type SimpleCondition,
};
