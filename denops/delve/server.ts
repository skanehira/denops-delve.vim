import { streams } from "./deps.ts";
export type RunOptions = {
  CmdOpts: Deno.RunOptions;
  LogFile: string;
};

export class DlvServer {
  process!: Deno.Process;
  logFile!: string;
  env?: Record<string, string>;

  async Start(opt: RunOptions) {
    this.logFile = opt.LogFile;
    if (this.env) {
      opt.CmdOpts.env = this.env;
    }
    opt.CmdOpts.stdout = "piped";
    opt.CmdOpts.stderr = "piped";

    const f = await Deno.open(this.logFile, { write: true, read: true });
    this.process = Deno.run(opt.CmdOpts);

    if (this.process.stdout) {
      streams.copy(this.process.stdout, f);
    }

    if (this.process.stderr) {
      await streams.copy(this.process.stderr, f);
    }
    f.close();
  }

  Stop() {
    this.process.kill("SIGKILL");
    this.process.close();
  }
}
