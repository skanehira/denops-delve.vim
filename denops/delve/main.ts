import { Denops, mapping, Mode, path } from "./deps.ts";
import { Kind, Variable } from "./dlv_type.ts";

import { DlvClient } from "./client.ts";
import { DlvServer } from "./server.ts";

export async function main(denops: Denops): Promise<void> {
  // define commands
  const commands: string[] = [
    `command! -nargs=* -complete=file DlvStart call denops#notify("${denops.name}", "dlvStart", [<f-args>])`,
    `command! -nargs=+ -complete=file DlvStartWithEnv call denops#notify("${denops.name}", "dlvStartWithEnv", [<f-args>])`,
    `command! DlvBreakpoint call denops#notify("${denops.name}", "createBreakpoint", [<f-args>])`,
    `command! DlvBreakpointClear call denops#notify("${denops.name}", "clearBreakpoint", [<f-args>])`,
    `command! DlvStop call denops#notify("${denops.name}", "stop", [])`,
    `command! DlvContinue call denops#notify("${denops.name}", "continue", [])`,
    `command! DlvNext call denops#notify("${denops.name}", "next", [])`,
    `command! DlvStep call denops#notify("${denops.name}", "step", [])`,
    `command! DlvStepOut call denops#notify("${denops.name}", "stepout", [])`,
    `command! -nargs=1 DlvPrint call denops#notify("${denops.name}", "print", [<f-args>])`,
    `command! DlvOpenLog call denops#notify("${denops.name}", "openLog", [])`,
    `command! DlvBreakpoints call denops#notify("${denops.name}", "breakpoints", [])`,
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

  // define highlight
  await denops.cmd(
    `hi! DelveLine ctermfg=234 ctermbg=216 guifg=#392313 guibg=#e4aa80 cterm=bold`,
  );

  const cli: DlvClient = new DlvClient({ port: 8888 });
  const srv: DlvServer = new DlvServer();
  const signs = new Map<string, number>();

  let signID = 0;

  const log = async (arg: string): Promise<void> => {
    await Deno.writeTextFile(srv.logFile, arg);
  };

  denops.dispatcher = {
    async breakpoints(): Promise<void> {
      console.log(cli.breakpoints);
      await Promise.resolve();
    },
    async dlvStartWithEnv(...args: unknown[]): Promise<void> {
      const envfile = args[0] as string;
      if (args.length === 1) {
        const file = denops.call("bufname");
        args.push(file);
      }
      const env: Record<string, string> = {};
      const text = await Deno.readTextFile(path.resolve(envfile));
      for (const line of text.split("\n")) {
        if (line === "" || line[0] === "#") {
          continue;
        }
        const [k, v] = line.split("=");
        env[k] = v;
      }
      srv.env = env;
      const cmds = args.slice(1);
      await denops.dispatch(denops.name, "dlvStart", cmds);
    },

    async dlvStart(...args: unknown[]): Promise<void> {
      if (args.length === 0) {
        const file = await denops.call("bufname");
        args.push(file);
      }

      // run dlv as headless server
      const logFile = await Deno.makeTempFile({ prefix: "denops_delve" });
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
      };
      if (args.length > 1) {
        opts.cmd.push("--", ...(args.slice(1) as string[]));
      }

      try {
        srv.Start({ CmdOpts: opts, LogFile: logFile });
        await cli.connect();
      } catch (e) {
        console.error(e.toString());
        return;
      }

      console.log("dlv started");
    },

    async stop() {
      await cli.stop();
      await clearHighlightLine();
      console.log("stopped");
    },

    async openLog() {
      if (srv.logFile) {
        const winid = await denops.call("win_getid");
        await runTerminal(denops, ["tail", "-f", srv.logFile]);
        await denops.call("win_gotoid", winid);
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

      try {
        await cli.createBreakpoint(file, line);
        await denops.call(
          "sign_place",
          ++signID,
          "delve",
          "delve_breakpoint",
          "",
          {
            lnum: line,
            priority: 99,
          },
        );
        signs.set(`${file}:${line}`, signID);
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
      try {
        const key = `${file}:${line}`;
        await cli.clearBreakpoint(file, line);
        const signID = signs.get(key);
        if (!signID) {
          return;
        }
        await denops.call("sign_unplace", "delve", {
          buffer: file,
          id: signID,
        });
        signs.delete(key);
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
      try {
        const variable = await cli.eval(arg);
        console.log(formatVariable(variable));
      } catch (e) {
        console.error(e.toString());
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
    await clearHighlightLine();

    const state = await cli.toNext(name);
    if (state.exited) {
      return;
    }
    log(JSON.stringify(state, null, 2));

    if (state.currentThread && state.currentThread.file) {
      const [file, line] = [
        state.currentThread.file,
        state.currentThread.line,
      ];
      await denops.cmd(`e +${line} ${file}`);

      // if file was already opend the other window, jump to its window
      // const winid = await denops.call("bufwinid", file);
      // if (winid !== -1) {
      //   await denops.batch(
      //     ["win_gotoid", winid],
      //     ["cursor", line, 1],
      //   );
      // } else {
      //   await denops.cmd(
      //     `new +${line} ${file}`,
      //   );
      // }
      await highlightLine(line);
    }
  };

  const clearHighlightLine = async () => {
    await denops.cmd(`syntax clear DelveLine`);
  };

  const highlightLine = async (line: number) => {
    await denops.cmd(`syntax match DelveLine /\\%${line}l.*/`);
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
