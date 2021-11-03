import { Denops, mapping, Mode, path, rpc } from "./deps.ts";
import {
  Breakpoint,
  BreakpointResult,
  CurrentThread,
  DebuggerStateResult,
  Kind,
  Variable,
  VariableResult,
} from "./dlv_type.ts";

import { createBreakpoints } from "./dlv_funcs.ts";

export async function main(denops: Denops): Promise<void> {
  // define commands
  const commands: string[] = [
    `command! -nargs=* -complete=file DlvDebugStart call denops#notify("${denops.name}", "dlvDebugStart", [<f-args>])`,
    `command! -nargs=+ -complete=file DlvDebugStartWithEnv call denops#notify("${denops.name}", "dlvDebugStartWithEnv", [<f-args>])`,
    `command! DlvBreakpoint call denops#notify("${denops.name}", "createBreakpoint", [<f-args>])`,
    `command! DlvBreakpointClear call denops#notify("${denops.name}", "clearBreakpoint", [<f-args>])`,
    `command! DlvStop call denops#notify("${denops.name}", "stop", [])`,
    `command! DlvContinue call denops#notify("${denops.name}", "continue", [])`,
    `command! DlvNext call denops#notify("${denops.name}", "next", [])`,
    `command! DlvStep call denops#notify("${denops.name}", "step", [])`,
    `command! DlvStepOut call denops#notify("${denops.name}", "stepout", [])`,
    `command! -nargs=1 DlvPrint call denops#notify("${denops.name}", "print", [<f-args>])`,
    `command! DlvOpenLog call denops#notify("${denops.name}", "openLog", [])`,
  ];
  for (const cmd of commands) {
    await denops.cmd(cmd);
  }

  // define maps
  mapping.map(denops, "<Plug>(dlv-breakpoint)", ":DlvBreakpoint<CR>", {
    silent: true,
    mode: "n" as Mode,
    noremap: true,
  });
  mapping.map(
    denops,
    "<Plug>(dlv-breakpoint-clear)",
    ":DlvBreakpointClear<CR>",
    {
      silent: true,
      mode: "n" as Mode,
      noremap: true,
    },
  );

  mapping.map(denops, "<Plug>(dlv-continue)", ":DlvContinue<CR>", {
    silent: true,
    mode: "n" as Mode,
    noremap: true,
  });

  mapping.map(denops, "<Plug>(dlv-next)", ":DlvNext<CR>", {
    silent: true,
    mode: "n" as Mode,
    noremap: true,
  });
  mapping.map(denops, "<Plug>(dlv-step)", ":DlvStep<CR>", {
    silent: true,
    mode: "n" as Mode,
    noremap: true,
  });
  mapping.map(denops, "<Plug>(dlv-stepout)", ":DlvStepOut<CR>", {
    silent: true,
    mode: "n" as Mode,
    noremap: true,
  });
  mapping.map(denops, "<Plug>(dlv-print)", ":DlvPrint <C-r><C-w><CR>", {
    silent: true,
    mode: "n" as Mode,
    noremap: true,
  });

  mapping.map(denops, "<Plug>(dlv-stop)", ":DlvStop<CR>", {
    silent: true,
    mode: "n" as Mode,
    noremap: true,
  });

  // define signs
  await denops.cmd(
    `sign define delve_breakpoint text=● texthl=ErrorMsg`,
  );

  await denops.cmd(
    `hi! DelveLine ctermfg=234 ctermbg=216 guifg=#392313 guibg=#e4aa80 cterm=bold`,
  );

  let cli: rpc.Client;
  let dlvProcess: Deno.Process;

  let currentBreakpointID = 0;
  const breakpoints = new Map<number, Breakpoint>();

  let currentThread: CurrentThread;
  let logFile: string;
  let env: Record<string, string> | undefined = {};

  denops.dispatcher = {
    async dlvDebugStartWithEnv(...args: unknown[]): Promise<void> {
      const envfile = args[0] as string;
      if (args.length === 1) {
        const file = denops.call("bufname");
        args.push(file);
      }
      const text = await Deno.readTextFile(path.resolve(envfile));
      if (!env) {
        env = {};
      }
      for (const line of text.split("\n")) {
        if (line === "" || line[0] === "#") {
          continue;
        }
        const [k, v] = line.split("=");
        env[k] = v;
      }
      const cmds = args.slice(1);
      await denops.dispatch(denops.name, "dlvDebugStart", cmds);
    },

    async dlvDebugStart(...args: unknown[]): Promise<void> {
      if (args.length === 0) {
        const file = await denops.call("bufname");
        args.push(file);
      }
      // run dlv as headless server
      logFile = await Deno.makeTempFile({ prefix: "denops_delve" });
      const opts: Deno.RunOptions = {
        cmd: [
          "dlv",
          "debug",
          args[0] as string,
          "--headless",
          "--api-version",
          "2",
          "--log",
          "--log-output",
          "rpc",
          "--log-dest",
          logFile,
          "-l",
          ":8888",
          "--accept-multiclient",
        ],
        env: env,
      };
      if (args.length > 1) {
        opts.cmd.push("--", ...(args.slice(1) as string[]));
      }
      dlvProcess = Deno.run(opts);

      const maxRetry = 10;
      let count = 0;
      while (1) {
        try {
          if (count > maxRetry) {
            console.error("failed to wait start dlv server");
            return;
          }
          const conn = await Deno.connect({ port: 8888 });
          cli = new rpc.Client(conn);
          count++;
        } catch {
          // retry
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        break;
      }

      // create breakpoints
      const bps: Breakpoint[] = [];
      for (const [_, bp] of breakpoints.entries()) {
        bps.push(bp);
      }
      try {
        await createBreakpoints(cli, ...bps);
      } catch (e) {
        console.log(e.toString());
        denops.dispatch(denops.name, "stop");
        return;
      }

      console.log("dlv started");
    },

    async stop() {
      await clearAllBerakpoint();
      await removeHighlightLine();

      await cli.Request({
        method: "RPCServer.Detach",
        params: [
          {
            kill: true,
          },
        ],
      });

      dlvProcess.close();
      cli.close();
      env = undefined;
      console.log("dlv stopped");
    },

    async openLog() {
      if (logFile) {
        await runTerminal(denops, ["tail", "-f", logFile]);
      }
    },

    async createBreakpoint(...args: unknown[]) {
      let file: string;
      let line: number;
      if (args.length == 2) {
        file = args[0] as string;
        line = Number(args[1]);
      } else {
        const results = await denops.batch(
          ["expand", "%:p"],
          ["line", "."],
        ) as string[];
        file = results[0];
        line = Number(results[1]);
      }

      currentBreakpointID++;
      const breakpoint: Breakpoint = {
        id: currentBreakpointID,
        file: file,
        line: line,
      };

      try {
        addBreakpointSign(Number(line), breakpoint.id);
        breakpoints.set(breakpoint.id, breakpoint);

        if (cli !== undefined) {
          createBreakpoints(cli, breakpoint);
        }
      } catch (e) {
        console.error(e.toString());
      }
    },

    async clearBreakpoint(...args: unknown[]) {
      let file: string;
      let line: number;
      if (args.length == 2) {
        file = args[0] as string;
        line = Number(args[1]);
      } else {
        const results = await denops.batch(
          ["expand", "%:p"],
          ["line", "."],
        ) as string[];
        file = results[0];
        line = Number(results[1]);
      }
      const signInfo = await denops.call("sign_getplaced", file, {
        lnum: line,
        group: "delve",
      }) as [{ signs: [{ id: number }] | [] }];
      if (signInfo[0].signs.length === 0) {
        console.error("not found sign");
        return;
      }
      const id = signInfo[0].signs[0].id;
      try {
        const breakpoint = breakpoints.get(id);
        if (!breakpoint) {
          console.error("not found breakpoint");
          return;
        }
        await clearBreakpoint(cli, breakpoint);
      } catch (e) {
        console.log(e.toString());
      }
    },

    async step() {
      try {
        await toNext("step");
      } catch (e) {
        console.error(e.toString());
      }
    },

    async stepout() {
      try {
        await toNext("stepOut");
      } catch (e) {
        console.error(e.toString());
      }
    },

    async next() {
      try {
        await toNext("next");
      } catch (e) {
        console.error(e.toString());
      }
    },

    async continue() {
      try {
        await toNext("continue");
      } catch (e) {
        console.error(e.toString());
      }
    },

    async print(arg: unknown) {
      const req = {
        method: "RPCServer.Eval",
        params: [
          {
            scope: {
              goroutineID: currentThread.goroutineID,
            },
            expr: arg,
          },
        ],
      };

      const resp = await cli.Request<VariableResult>(req);
      if (resp.result) {
        console.log(formatVariable(resp.result.Variable));
      } else {
        console.error(resp?.error);
      }
    },
  };

  const formatVariable = (variable: Variable): string => {
    switch (variable.kind) {
      case Kind.Func:
      case Kind.Int:
      case Kind.Int8:
      case Kind.Int16:
      case Kind.Int32:
      case Kind.Int64:
      case Kind.Uint:
      case Kind.Uint8:
      case Kind.Uint16:
      case Kind.Uint32:
      case Kind.Uint64:
      case Kind.Bool:
      case Kind.Uintptr:
      case Kind.UnsafePointer:
      case Kind.Float32:
      case Kind.Float64:
      case Kind.Complex64:
      case Kind.Complex128:
        return `${variable.value}`;
      case Kind.Map:
        return `["${formatVariable(variable.children[0])}": ${
          formatVariable(variable.children[1])
        }]`;
      case Kind.Array:
      case Kind.Slice:
        return `[${
          variable.children.map((v) => formatVariable(v)).join(", ")
        }]`;
      case Kind.String:
        return `"${variable.value}"`;
      case Kind.Interface:
        return `${formatVariable(variable.children[0])}`;
      case Kind.Struct:
        return `{ ${variable.realType} } { ${
          variable.children.map((v) => v.name + ": " + formatVariable(v)).join(
            ", ",
          )
        } }`;
    }
    return `${variable.realType}`;
  };

  const toNext = async (name: string) => {
    await removeHighlightLine();

    const req = {
      method: "RPCServer.Command",
      params: [
        {
          name: name,
        },
      ],
    };

    const resp = await cli.Request<DebuggerStateResult>(req);
    if (!resp.result) {
      throw new Error(resp?.error?.message);
    }
    const state = resp.result?.State;
    if (state.exited) {
      await denops.dispatch(denops.name, "stop");
      return;
    }

    if (state.currentThread) {
      currentThread = state.currentThread;
      // if file was already opend the other window, jump to its window
      const winid = await denops.call("bufwinid", state.currentThread.file);
      if (winid !== -1) {
        await denops.batch(
          ["win_gotoid", winid],
          ["cursor", state.currentThread.line, 1],
        );
      } else {
        await denops.cmd(
          `new +${state.currentThread.line} ${state.currentThread.file}`,
        );
      }
      await highlightLine(state.currentThread.line);
    }
  };

  const removeHighlightLine = async () => {
    await denops.cmd(`syntax clear DelveLine`);
  };

  const highlightLine = async (line: number) => {
    await denops.cmd(`syntax match DelveLine /\\%${line}l.*/`);
  };

  const addBreakpointSign = async (line: number, id: number) => {
    await denops.call("sign_place", id, "delve", "delve_breakpoint", "", {
      lnum: line,
      priority: 99,
    });
  };

  const clearAllBerakpoint = async () => {
    for (const [_, breakpoint] of breakpoints.entries()) {
      await clearBreakpointSign(breakpoint);
    }
  };

  const clearBreakpoint = async (
    cli: rpc.Client,
    breakpoint: Breakpoint,
  ): Promise<Breakpoint> => {
    const req = {
      method: "RPCServer.ClearBreakpoint",
      params: [
        { id: breakpoint.id },
      ],
    };
    const resp = await cli.Request<BreakpointResult>(req);
    if (resp.result) {
      await clearBreakpointSign(breakpoint);
      return resp?.result?.Breakpoint as Breakpoint; // improve
    }
    throw new Error(resp?.error?.message);
  };

  const clearBreakpointSign = async (breakpoint: Breakpoint) => {
    breakpoints.delete(breakpoint.id);
    await denops.call("sign_unplace", "delve", {
      buffer: breakpoint.file,
      id: breakpoint.id,
    });
  };

  const runTerminal = async (denops: Denops, cmd: string[]) => {
    if (await denops.call("has", "nvim")) {
      await denops.cmd("15 new");
      await denops.call("termopen", cmd);
    } else {
      await denops.cmd(`terminal ++rows=15 ++shell ${cmd.join(" ")}`);
      await denops.cmd("nnoremap <buffer> <silent> <CR> :bw<CR>");
    }
  };
}
