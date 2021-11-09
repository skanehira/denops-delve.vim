import {
  Breakpoint,
  BreakpointResult,
  DebuggerStateResult,
  State,
  UnaddedBreakpoint,
  Variable,
  VariableResult,
} from "./dlv_type.ts";
import { rpc } from "./deps.ts";

export class DlvClient {
  #rpcClient!: rpc.Client;
  state!: State | undefined;
  breakpoints: Map<string, Breakpoint>;
  unaddedBreakpoints: Map<string, UnaddedBreakpoint>;

  constructor() {
    this.breakpoints = new Map<string, Breakpoint>();
    this.unaddedBreakpoints = new Map<string, Breakpoint>();
  }

  async wait(msec: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, msec));
  }

  async connect(opt: { hostname?: string; port: number }) {
    const conn = await Deno.connect({
      hostname: opt.hostname,
      port: opt.port,
    });
    const cli = new rpc.Client(conn);
    this.#rpcClient = cli;

    const state = await this.getState(false);
    if (state.Running) {
      const state = await this.halt();
      this.state = state;
    } else {
      this.state = state;
    }

    for (const { file, line } of this.unaddedBreakpoints.values()) {
      const bp = await this.applyBreakpoint(file, line);
      const key = `${file}:${line}`;
      this.unaddedBreakpoints.delete(key);
      this.breakpoints.set(key, bp);
    }
  }

  async getState(nonBlocking: boolean): Promise<State> {
    const stateResult = await this.request<DebuggerStateResult>({
      method: "RPCServer.State",
      params: [
        {
          Nonblocking: nonBlocking,
        },
      ],
    });
    return stateResult.State;
  }

  async restart(rebuild: boolean): Promise<void> {
    const req = {
      method: "RPCServer.Restart",
      params: [
        {
          rebuild: rebuild,
        },
      ],
    };
    await this.request(req);
  }

  async stop(): Promise<void> {
    const req = {
      method: "RPCServer.Detach",
      params: [
        {
          kill: true,
        },
      ],
    };
    await this.request(req);
    this.#rpcClient.close();
    this.state = undefined;
    for (const bp of this.breakpoints.values()) {
      const key = `${bp.file}:${bp.line}`;
      this.unaddedBreakpoints.set(key, bp);
      this.breakpoints.delete(key);
    }
  }

  async createBreakpoint(
    file: string,
    line: number,
    text: string,
    bufnr: number,
  ): Promise<void> {
    const key = `${file}:${line}`;
    // just add breakpoint before connect delve server
    if (!this.state || this.state.exited) {
      const bp = {
        file: file,
        line: line,
        text: text,
        bufnr: bufnr,
      };
      this.unaddedBreakpoints.set(key, bp);
      return;
    }

    const bp = await this.applyBreakpoint(file, line);
    bp.text = text;
    bp.bufnr = bufnr;
    this.breakpoints.set(key, bp);
  }

  async applyBreakpoint(file: string, line: number): Promise<Breakpoint> {
    const req = {
      method: "RPCServer.CreateBreakpoint",
      params: [
        { breakPoint: { file: file, line: line } },
      ],
    };
    const resp = await this.request<BreakpointResult>(req);
    return resp.Breakpoint;
  }

  async clearBreakpoint(file: string, line: number): Promise<void> {
    const key = `${file}:${line}`;
    if (this.state && !this.state.exited) {
      const bp = this.breakpoints.get(key);
      if (!bp) {
        throw new Error("not found breakpoint");
      }
      const req = {
        method: "RPCServer.ClearBreakpoint",
        params: [
          { id: bp.id },
        ],
      };
      await this.request(req);
      this.breakpoints.delete(key);
    }
    this.unaddedBreakpoints.delete(key);
  }

  async clearAllBreakpoints(): Promise<void> {
    for (const bp of this.breakpoints.values()) {
      await this.clearBreakpoint(bp.file, bp.line);
    }
  }

  async toNext(name: string): Promise<State> {
    const req = {
      method: "RPCServer.Command",
      params: [
        {
          name: name,
        },
      ],
    };

    const resp = await this.request<DebuggerStateResult>(req);
    this.state = resp.State;
    return resp.State;
  }

  async eval(expr: unknown): Promise<Variable> {
    if (!this.state?.currentThread) {
      throw new Error("there are no current thread");
    }

    const req = {
      method: "RPCServer.Eval",
      params: [
        {
          scope: {
            goroutineID: this.state.currentThread.goroutineID,
          },
          expr: expr,
        },
      ],
    };

    const resp = await this.request<VariableResult>(req);
    return resp.Variable;
  }

  async halt(): Promise<State> {
    const resp = await this.#rpcClient.Request<DebuggerStateResult>({
      method: "RPCServer.Command",
      params: [
        {
          name: "halt",
        },
      ],
    });
    return resp?.result?.State as State;
  }

  async setVariable(symbol: string, value: string): Promise<void> {
    if (!this.state?.currentThread?.goroutineID) return;
    const req = {
      method: "RPCServer.Set",
      params: [
        {
          Scope: {
            GoroutineID: this.state?.currentThread?.goroutineID,
          },
          Symbol: symbol,
          Value: value,
        },
      ],
    };
    await this.request(req);
  }

  async request<T>(req: rpc.Request): Promise<T> {
    // TODO: check state that if can request
    // current implementation need to halt process before send some request
    this.state = await this.halt();

    const resp = await this.#rpcClient.Request<T>(req);
    if (resp.error) {
      // delve error is string
      // deno-lint-ignore no-explicit-any
      throw new Error(resp.error as any);
    }
    return resp?.result as T;
  }
}
