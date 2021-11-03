export type Breakpoint = {
  id: number;
  file: string;
  line: number;
};

export type BreakpointResult = {
  Breakpoint: Breakpoint;
};

export type VariableResult = {
  Variable: Variable;
};

export enum Kind {
  Invalid,
  Bool,
  Int,
  Int8,
  Int16,
  Int32,
  Int64,
  Uint,
  Uint8,
  Uint16,
  Uint32,
  Uint64,
  Uintptr,
  Float32,
  Float64,
  Complex64,
  Complex128,
  Array,
  Chan,
  Func,
  Interface,
  Map,
  Ptr,
  Slice,
  String,
  Struct,
  UnsafePointer,
}

export type Variable = {
  name: string;
  type: string;
  kind: Kind;
  realType: string;
  value: unknown;
  children: Variable[];
};

export type CurrentThread = {
  id: number;
  file: string;
  line: number;
  goroutineID: number;
};

export type State = {
  Pid: number;
  Running: boolean;
  Recording: boolean;
  exited: boolean;
  exitStatus: number;
  currentThread?: CurrentThread;
};

// {
//   id: 2,
//   result: {
//     State: {
//       Pid: 0,
//       Running: false,
//       Recording: false,
//       CoreDumping: false,
//       currentThread: {
//         id: 11452509,
//         pc: 4342488344,
//         file: "/Users/skanehira/dev/go/src/github.com/skanehira/gjo/main.go",
//         line: 159,
//         function: [Object],
//         goroutineID: 1,
//         ReturnValues: null,
//         CallReturn: false
//       },
//       currentGoroutine: {
//         id: 1,
//         currentLoc: [Object],
//         userCurrentLoc: [Object],
//         goStatementLoc: [Object],
//         startLoc: [Object],
//         threadID: 11452509,
//         status: 2,
//         waitSince: 0,
//         waitReason: 14,
//         unreadable: ""
//       },
//       Threads: [ [Object], [Object], [Object], [Object], [Object] ],
//       NextInProgress: false,
//       WatchOutOfScope: [],
//       exited: false,
//       exitStatus: 0,
//       When: ""
//     }
//   },
//   error: null
// }
export type DebuggerStateResult = {
  State: State;
};
