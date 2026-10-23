import Foundation
import Dispatch
import Darwin
import Network

// Keep a stable application identity alive while launchd owns the backend.
// A detached child of an editor still inherits that editor's network identity.
struct Request: Decodable {
    let executable: String
    let arguments: [String]
    let cwd: String
    let environment: [String: String]
    let stateFile: String
    let probeHost: String?
    let probePort: UInt16?
}

func saveState(_ value: [String: Int32], to file: String) throws {
    let data = try JSONSerialization.data(withJSONObject: value)
    try data.write(to: URL(fileURLWithPath: file), options: .atomic)
    guard chmod(file, 0o600) == 0 else { throw CocoaError(.fileWriteNoPermission) }
}

do {
    guard CommandLine.arguments.count == 2 else { throw CocoaError(.fileReadInvalidFileName) }
    let requestFile = CommandLine.arguments[1]
    let request = try JSONDecoder().decode(Request.self, from: Data(contentsOf: URL(fileURLWithPath: requestFile)))
    // This is a single explicit launch. Never leave credentials for a later
    // launchd kickstart or an automatic retry to reuse.
    try FileManager.default.removeItem(atPath: requestFile)
    if let host = request.probeHost, let port = request.probePort, port > 0 {
        try saveState(["pid": getpid(), "launcherPid": getpid()], to: request.stateFile)
        let connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port)!, using: .tcp)
        let finish: (Int32) -> Void = { code in
            try? saveState(["pid": getpid(), "launcherPid": getpid(), "exitCode": code], to: request.stateFile)
            connection.cancel()
            exit(code)
        }
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready: finish(0)
            case .failed: finish(1)
            case .waiting(.posix(.ECONNREFUSED)): finish(1)
            default: break
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { finish(1) }
        connection.start(queue: .main)
        dispatchMain()
    }
    let child = Process()
    child.executableURL = URL(fileURLWithPath: request.executable)
    child.arguments = request.arguments
    child.currentDirectoryURL = URL(fileURLWithPath: request.cwd)
    child.environment = request.environment
    try child.run()
    do {
        try saveState(["pid": child.processIdentifier, "launcherPid": getpid()], to: request.stateFile)
    } catch {
        child.terminate()
        child.waitUntilExit()
        throw error
    }
    let childPid = child.processIdentifier
    let sources = [SIGTERM, SIGINT, SIGHUP].map { number -> DispatchSourceSignal in
        signal(number, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
        source.setEventHandler { if child.isRunning { kill(childPid, number) } }
        source.resume()
        return source
    }
    child.terminationHandler = { process in
        let status = process.terminationStatus
        try? saveState([
            "pid": childPid, "launcherPid": getpid(),
            "exitCode": process.terminationReason == .exit ? status : 128 + status,
        ], to: request.stateFile)
        exit(process.terminationReason == .exit ? status : 128 + status)
    }
    withExtendedLifetime(sources) { dispatchMain() }
} catch {
    // Config and OS errors can contain paths or environment values.
    FileHandle.standardError.write(Data("[local-runtime] 后台启动器无法启动候选进程；请检查启动请求和执行权限。\n".utf8))
    exit(70)
}
