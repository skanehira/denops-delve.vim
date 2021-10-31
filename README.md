# denops-delve.vim - UNDER DEVELOPMENT
Vim/Neovim plugin for [delve](https://github.com/go-delve/delve)

![](https://i.gyazo.com/21230158a0ac01a6d3e61990f1a72dc7.gif)

## Usage

| Command               | Description                                 |
|-----------------------|---------------------------------------------|
| `:DlvStart`           | Start delve server                          |
| `:DlvBreakpoint`      | Sets a breakpoint to current line           |
| `:DlvBreakpointClear` | Clear a breakpoint at current line          |
| `:DlvStop`            | Stop delve                                  |
| `:DlvContinue`        | Run until breakpoint or program termination |
| `:DlvNext`            | Step over to next source line               |
| `:DlvStep`            | Single step through program                 |
| `:DlvStepOut`         | Step out of the current function            |
| `:DlvPrint`           | Evaluate an expression                      |
| `:DlvOpenLog`         | Watch delve logging                         |

## Author
skanehira
