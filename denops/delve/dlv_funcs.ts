import { rpc } from "./deps.ts";
import { Breakpoint, BreakpointResult } from "./dlv_type.ts";

export async function createBreakpoints(
  cli: rpc.Client,
  ...breakpoints: Breakpoint[]
): Promise<Breakpoint[]> {
  const ret: Breakpoint[] = [];

  for (const bp of breakpoints) {
    const req = {
      method: "RPCServer.CreateBreakpoint",
      params: [
        { breakPoint: { file: bp.file, line: bp.line } },
      ],
    };
    const resp = await cli.Request<BreakpointResult>(req);
    if (resp.result) {
      ret.push(resp.result?.Breakpoint);
    } else {
      throw new Error(resp?.error?.data as string);
    }
  }

  return ret;
}
