# macOS Node 测试内核保护 / Native Node Test Guard

本目录维护开发 Mac 的 Node 原生测试保护。当前 Node 启动入口、跨会话准入、共享预算和内核限额构成同一条链路；[通用测试门禁](../README.md#node-test-resource-limits)继续负责执行摘要、零跳过和失败诊断。

开发 Vite 与日志查看器共用进程身份检查。保护器重装后，旧进程仅在源码身份相同、同一安装根、目录及文件由 root 所有且不可被其他用户写入、没有符号链接、Bootstrap 字节完全一致时继续被识别；未知预加载脚本仍拒绝接管。原生 guardian 由已核实的 Node 父进程退出触发回收，不作为日志查看器发送退出信号。

## 运行边界

安装器将当前 Node 原件保存在机器本地受控目录，通过同目录原子替换发布一个签名启动器。原有进程继续使用原 inode；新启动的 Node 原生测试、QA 入口及其 Node 后代进入保护。普通业务 Node 程序保留原运行版本，测试模块的动态导入须先进入受保护执行上下文。

| 事项 | 当前合同 |
| --- | --- |
| 机器级预算 | 最多 6144 MiB，并且不超过物理内存的四分之一；由所有受保护 Node 进程共享 |
| 跨会话准入 | 一个活动作业；其他提交在内核文件锁上等待，最多 15 分钟；等待者尚未启动 V8 |
| 单进程限额 | QA 编排 256 MiB、原生测试 runner 512 MiB、worker / Node 后代 1024 MiB；active / inactive 两种状态都设置 fatal 限额 |
| 文件并发 | macOS 原生测试固定为 1，包含裸命令传入更高并发的情况；Linux / CI 的文件并发合同保持原入口配置 |
| 超额处理 | 共享预算不足时，在执行 Node 前返回非零；超出进程内核限额由系统终止，不依赖 JavaScript 事件循环或 RSS 采样 |
| 超时 | 裸命令 2 分钟、QA 编排 30 分钟；原生父进程负责墙钟时限，通用门禁保留文件 worker 等更细限制 |
| 生命周期 | 预算由独立的原生 guardian 持有至对应 Node 实际退出；kqueue 退出事件处理客户端终止、SIGKILL 和 detached Node 后代，无常驻服务或 PID registry |

预算是 Node 私有内存 / footprint 的保守预留，不是允许任意数量的测试同时争用内存。当前实际验证绑定 Mac 的物理内存、Node 原件、Darwin release、源码指纹与安装回执；有限会话验证不外推无限并发，其他应用及非 Node 负载不计入这份 Node 账本。下述工具内置 Node 的堆保护也不计入这份 6 GiB 账本。

<a id="embedded-tool-heap-guard"></a>

## 工具内置 Node 的堆保护

工具计算内核受自身系统沙箱约束。真实 MCP 验证表明，该沙箱拒绝原生测试启动器访问共享锁文件，因此这里使用独立的 V8 堆上限，不改变沙箱、应用封装或已有会话。它限制 JavaScript 堆，不能代替上面的内核限额和共享总预算。

| 入口 | 当前处理 | 生效边界 |
| --- | --- | --- |
| 用户 MCP 配置的 Node REPL | `NODE_REPL_NODE_PATH` 指向应用外启动器，老生代上限 512 MiB | 新建立且采用该用户配置的连接；独立真实 MCP 内核已验证 |
| 已存在的 Artifact 私有 runtime generation | 保留原始签名 Node，在应用外保存；私有缓存入口原子替换为签名启动器，老生代上限 1024 MiB | 该缓存路径的新启动；保留原文件 owner / mode，原进程继续使用旧 inode |
| `process.execPath` 子进程 | Bootstrap 指回受保护入口；清空环境后仍注入堆上限 | 经过已安装启动器的进程及按该路径创建的 Node 子进程 |
| 工具入口的裸 `--test` | 固定文件并发为 1，worker 保留堆上限 | 不获得原生测试的跨会话准入或 6 GiB 总预算；项目测试仍使用统一门禁 |

上限指 V8 老生代，不是进程 RSS。默认年轻代配置下，实测 V8 总堆上限分别为 560 / 1072 MiB。启动器拒绝抬高老生代和百分比等覆盖参数，允许显式降低老生代上限；不支持 `NODE_OPTIONS` 内的堆大小设置，其他选项保留。资源参数由该入口保留，不作为业务脚本参数转发。

下列范围仍可绕过或超出这种保护：

- 直接执行应用内原始 CUA Node、显式执行备份原件，或其他未登记的 Node 副本。
- 安装前的进程、旧工具连接，以及覆盖用户 MCP 配置的桌面宿主。现场桌面 Node REPL 连接仍回读到 4288 MiB；不能以独立 MCP 验证成功推断该连接已经受保护。
- 安装后新生成的 Artifact runtime generation；安装器只处理当次已存在的私有副本，不建立后台监控。
- Buffer、ArrayBuffer、原生模块及其他堆外内存；多会话堆与堆外内存合计也不受这份工具堆策略限制。专项测试用 32 MiB 老生代入口成功分配 96 MiB Buffer，保留这一负向证据。

原始 CUA Node 和应用资源封装保持字节一致；Artifact 只改用户私有缓存中的入口，原始签名二进制保存并验证。安装器只修改 `~/.codex/config.toml` 的一个 Node REPL 路径字段，保留其他配置；配置漂移时停止覆盖。桌面应用是否采用该配置须以实际内核回读为准，不能假定所有会话自动切换。MCP 的环境变量配置字段见 [OpenAI 官方配置说明](https://learn.chatgpt.com/docs/config-file/config-reference)。

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/qa/native/test_node_tool_guard.py
python3 scripts/qa/native/install-node-tool-guard.py --install
python3 scripts/qa/native/verify_node_tool_guard.py --out output/qa/node-tool-heap/verification.json
```

验证会执行独立 MCP 的正常计算、真实堆耗尽退出、子进程、单作业内文件串行、原始路径绕过和私有副本安装 / 回滚 / 重装；不对运行中的其他会话注入配额或发信号。只读的桌面工具 API 回读须另行记录，脚本不能证明宿主已采用用户配置。

机器本地工具回执位于 `/Library/Application Support/PlushNodeTestGuard/tools/installation.json`。Node 原件变化后，启动器在应用代码前拒绝运行，需重新核对、安装和验证。显式回滚只恢复对应 MCP 路径字段和私有缓存原件；外部启动器与不可变版本保留，避免影响已启动进程。应用内原始入口、老连接或配置归属漂移时不会擅自重启或覆盖。

```bash
python3 scripts/qa/native/install-node-tool-guard.py --rollback
```

<a id="bounded-child-memory"></a>

## 受限子进程的额度声明

多进程夹具可在启动对应 Node 子进程时设置 `PLUSH_NODE_GUARD_MEMORY_MIB`，为已知的小负载声明较小额度。该值须为正整数、以 128 MiB 为单位且不超过当前角色的默认限额；预留预算与 active / inactive fatal 内核限额使用同一额度，V8 堆预算随之下调。超限、非法单位和空值在启动 V8 前拒绝。未声明时继续使用默认策略。

例如，操作记录的六进程并发夹具每个子进程声明 256 MiB，并读回内核限额；六个进程及原并发断言均保留。全机 6144 MiB 预算、默认 worker 上限和跨会话串行准入不变。该环境变量仅属于 macOS 原生保护入口，Linux / CI 沿用既有资源保护。

```javascript
spawn(process.execPath, args, {
  env: { ...process.env, PLUSH_NODE_GUARD_MEMORY_MIB: '256' },
})
```

## 安装、核对与回滚

1. 修改本目录 C / Bootstrap 后先运行隔离的真实内核回归。它会为夹具预留主机预算，不使用采样器代替内核终止证据。

   ```bash
   PYTHONDONTWRITEBYTECODE=1 python3 scripts/qa/native/test_node_test_guard.py
   ```

2. 在本轮已授权的运行维护范围内安装并核对。安装依赖现有 Python 3、clang、codesign、钥匙串中有效的代码签名证书及其私钥和可用的非交互 sudo，不修改 sudoers。首次安装只有一张有效证书时自动选择；存在多张时用 `--sign-identity <证书 SHA1>` 明确选择。后续更新沿用机器回执登记的证书；证书缺失、过期或不可用时停止安装，不退回临时签名。

   ```bash
   python3 scripts/qa/native/install-node-test-guard.py --install
   node --plush-guard-status
   ```

3. 使用正式门禁验证当前工作区。冻结副本必须同步同一版本的 C、Bootstrap 与通用保护器；源码与宿主版本不一致时，门禁失败关闭，不绕过检查。

   ```bash
   node scripts/qa/run-test-gate.mjs --kind node --label native-node-safety -- node --test --test-reporter=tap web/scripts/test/nodeTestProcess.test.mjs web/scripts/runUnitTests.test.mjs
   ```

4. 显式停用时回滚到原始 Node。安装器等待当前作业结束、核对原件与当前启动器指纹，保留版本和回执；回滚后可重新安装。独立夹具覆盖实际安装、回滚、重装和读回。

   ```bash
   python3 scripts/qa/native/install-node-test-guard.py --rollback
   ```

### 更新后的文件夹授权

正式安装使用固定程序标识 `local.plush.node-test-guard` 和证书签名。安装器在替换前校验候选程序满足上一版本的 designated requirement，安装后再次读回；身份不匹配或 smoke 失败时保留、恢复原启动器与回执。证书续期需要显式选择新证书，且新版本仍须满足原授权身份。签名证书及私钥只由本机钥匙串管理，不写入源码或分发包。

临时签名只用于不访问用户受保护目录的一次性隔离夹具。首次从旧临时签名切换到证书签名时，macOS 可能重新请求一次授权；安装器不修改 TCC 数据库、不清空已有权限，也不授予完全磁盘访问。后续版本可沿用授权的前提是程序身份和访问对象保持不变，且用户没有撤销权限。身份机制见 [Apple 签名要求说明](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements)。

签名回归会真实编译两个字节不同的版本，双向校验授权身份，并验证同名临时签名不能冒用旧授权；它不等于真实 TCC 验证。首次启用或修改签名流程后，另在用户已授权的文件夹中验证实际读取，记录 TCC 的授权对象；连续重新安装并重启测试进程，再确认读取成功且没有新增授权请求。只记录测试结果和必要日志，不保存文件夹内容。测试不得重置其他应用的权限，或用终端自身的完全磁盘访问冒充保护器授权。

已安装策略的实际负载验证从独立执行单元运行，不能包在另一个正在办理的 Node 测试作业内。它同时提交三个客户端、各请求两文件与更高文件并发，检查实际串行准入；按当前 6 GiB 预算验证超额进程在启动前拒绝，保持六个 256 MiB 子进程同时存活并读回预算和内核限额，再用同步 Buffer 分配验证默认内核限额。只保存有界结果、策略和峰值，不保留原始测试正文。

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/qa/native/verify_installed_guard.py --out output/qa/node-kernel/verification.json
```

输出路径须为 `output/` 下的新文件；已有回执不覆盖。结束后短暂持有准入锁，核对存活测试预留归零。

机器本地目录默认为 `/Library/Application Support/PlushNodeTestGuard`：`node.original` 是原始 Node，`versions/` 保存不可变启动器与 Bootstrap，`state/` 只保存内核锁文件，`installation.json` 保存版本、指纹和策略。该目录是测试运行依赖，不进入普通 output 清理；回滚保留原件与回执。

## 来源与失败关闭

内核限额使用 Apple XNU 的 `memorystatus_control` 设置和读回 `MEMORYSTATUS_CMD_SET_MEMLIMIT_PROPERTIES` / `GET_MEMLIMIT_PROPERTIES`，两种状态均要求 `MEMORYSTATUS_MEMLIMIT_ATTR_FATAL`。结构与命令来源为 [Apple XNU header](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/kern_memorystatus.h)；进程退出跟踪使用本机 SDK 的 kqueue / `EVFILT_PROC`。

这是绑定当前 Darwin ABI 的机器本地能力：启动时检查内核 release；命令、权限或读回不成立时停止测试。Node 或 macOS 升级、源码变化后重新隔离验证、安装和读回；不静默回退到仅采样保护。原始二进制用于版本核对、构建验证和显式回滚，不作为测试入口。退出此机制须先有验证通过的替代硬限额实现，再解除安装和门禁依赖。

测试调用 `sudo` 的 helper 只接受自身祖先中的原始 Node，并核对其原生 guardian、共享锁及预留额度；不接受任意其他进程作为目标。测试进程自身关闭文件描述符不会释放 guardian 的预留。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| [node-test-guard.c](node-test-guard.c) | 启动、共享准入与预算、内核限额 helper、外部超时、退出回收 |
| [node-test-bootstrap.cjs](node-test-bootstrap.cjs) | 在应用 / 测试代码之前激活内核限额，拦截未受保护的原生测试模块导入 |
| [install-node-test-guard.py](install-node-test-guard.py) | 编译签名、指纹保全、原子安装、验证失败恢复与显式回滚 |
| [test_node_test_guard.py](test_node_test_guard.py) | 真实内核、并发准入、超额、退出与安装 / 回滚回归 |
| [verify_installed_guard.py](verify_installed_guard.py) | 当前安装版本的真实多客户端、实际预算、默认内核限额和回执 |
| [node-tool-heap-guard.c](node-tool-heap-guard.c) | 沙箱可用的 V8 堆参数约束、文件并发和无 core dump 启动 |
| [node-tool-heap-bootstrap.cjs](node-tool-heap-bootstrap.cjs) | 工具运行时指纹核对及 `process.execPath` 子进程入口 |
| [install-node-tool-guard.py](install-node-tool-guard.py) | 应用外安装、MCP 单字段配置、私有缓存保全及显式回滚 |
| [test_node_tool_guard.py](test_node_tool_guard.py) | 真实堆耗尽、MCP、负向边界、配置与已有进程保全 |
| [verify_node_tool_guard.py](verify_node_tool_guard.py) | 已安装工具入口的实际堆限额、MCP 与剩余绕过回执 |
