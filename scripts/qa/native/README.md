# macOS Node 测试内核保护 / Native Node Test Guard

本目录维护开发 Mac 的 Node 原生测试保护。当前 Node 启动入口、跨会话准入、共享预算和内核限额构成同一条链路；[通用测试门禁](../README.md#node-test-resource-limits)继续负责执行摘要、零跳过和失败诊断。

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

预算是 Node 私有内存 / footprint 的保守预留，不是允许任意数量的测试同时争用内存。当前实际验证绑定 Mac 的物理内存、Node 原件、Darwin release、源码指纹与安装回执；有限会话验证不外推无限并发，其他应用及非 Node 负载不计入这份 Node 账本。

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

2. 在本轮已授权的运行维护范围内安装并核对。安装依赖现有 Python 3、clang、codesign 和可用的非交互 sudo，不修改 sudoers。

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
