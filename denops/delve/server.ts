export type RunOptions = {
  CmdOpts: Deno.RunOptions;
  LogFile: string;
};

export class DlvServer {
  process!: Deno.Process;
  logFile!: string;
  env?: Record<string, string>;

  Start(opt: RunOptions) {
    this.logFile = opt.LogFile;
    if (this.env) {
      opt.CmdOpts.env = this.env;
    }
    this.process = Deno.run(opt.CmdOpts);
  }

  Stop() {
    this.process.kill("SIGKILL");
    this.process.close();
  }
}
