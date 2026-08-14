// Agentopolis menu-bar app. Lives in the status bar with live counts; click
// pulls the office down as a popover; "Keep on screen" detaches it into a
// borderless floating panel. No dock icon, no window chrome, nothing to find.
//
// Compiled locally on first run by bin/agentopolis.js (a locally built binary
// carries no Gatekeeper quarantine). Usage:
//   agentopolis-widget <url> [--panel] [--show] [--node <path>] [--script <path>]
import Cocoa
import WebKit

let POLL_SECONDS: TimeInterval = 3
let POPOVER_SIZE = NSSize(width: 460, height: 340)
let BAR_HEIGHT: CGFloat = 22

func argValue(_ flag: String) -> String? {
  let a = CommandLine.arguments
  if let i = a.firstIndex(of: flag), i + 1 < a.count { return a[i + 1] }
  return nil
}
let argSet = Set(CommandLine.arguments)

let pageURL: String = {
  let first = CommandLine.arguments.dropFirst().first ?? ""
  if !first.isEmpty && !first.hasPrefix("--") { return first }
  return argValue("--url") ?? "http://127.0.0.1:4114/?widget=1"
}()

// Base origin (no query) for health checks and the browser view.
let originURL: String = {
  if let u = URL(string: pageURL), let scheme = u.scheme, let host = u.host {
    let port = u.port.map { ":\($0)" } ?? ""
    return "\(scheme)://\(host)\(port)"
  }
  return "http://127.0.0.1:4114"
}()

final class WidgetPanel: NSPanel {
  override var canBecomeKey: Bool { true }
}

final class Controller: NSObject, NSPopoverDelegate {
  let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  let popover = NSPopover()
  var popWebView: WKWebView!
  var panel: WidgetPanel?
  var panelWebView: WKWebView?
  var pollTimer: Timer?
  var serverProc: Process?
  var lastSummary: [String: Int] = [:]
  var serverUp = false

  let plistPath = NSString(string: "~/Library/LaunchAgents/dev.agentopolis.plist").expandingTildeInPath

  // ——— status bar ———

  func glyph(attention: Bool) -> NSImage {
    let img = NSImage(size: NSSize(width: 15, height: 13), flipped: false) { _ in
      let outer = NSBezierPath(roundedRect: NSRect(x: 0.75, y: 0.75, width: 13.5, height: 11.5),
                               xRadius: 2, yRadius: 2)
      outer.lineWidth = 1.3
      NSColor.black.setStroke()
      outer.stroke()
      NSColor.black.setFill()
      // two "rooms" — reads as a floor plan at 13px
      NSRect(x: 3, y: 3.2, width: 4, height: 6.4).fill()
      NSRect(x: 8.6, y: 6.4, width: 3.4, height: 3.2).fill()
      if attention { NSRect(x: 8.6, y: 3.2, width: 3.4, height: 2).fill() }
      return true
    }
    img.isTemplate = true
    return img
  }

  func renderStatus() {
    guard let button = statusItem.button else { return }
    let needs = lastSummary["needsYou"] ?? 0
    let working = lastSummary["working"] ?? 0
    let failed = lastSummary["failed"] ?? 0
    button.image = glyph(attention: needs > 0)
    button.imagePosition = .imageLeading

    var text = ""
    var color = NSColor.labelColor
    if !serverUp {
      text = " –"
      color = NSColor.tertiaryLabelColor
    } else if needs > 0 {
      text = " \(needs)!"
      color = NSColor.systemOrange
    } else if failed > 0 {
      text = " \(working)"
      color = NSColor.systemRed
    } else {
      text = " \(working)"
      color = NSColor.labelColor
    }
    button.attributedTitle = NSAttributedString(string: text, attributes: [
      .font: NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .semibold),
      .foregroundColor: color,
    ])
    button.toolTip = serverUp
      ? "Agentopolis — \(working) working, \(needs) need you"
      : "Agentopolis — server not running"
  }

  // ——— health polling ———

  func poll() {
    guard let url = URL(string: originURL + "/api/health") else { return }
    var req = URLRequest(url: url)
    req.timeoutInterval = 2
    URLSession.shared.dataTask(with: req) { data, _, _ in
      var up = false
      var summary: [String: Int] = [:]
      if let data = data,
         let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
         obj["ok"] as? Bool == true {
        up = true
        if let s = obj["summary"] as? [String: Any] {
          for (k, v) in s { if let n = v as? Int { summary[k] = n } }
        }
      }
      DispatchQueue.main.async {
        self.serverUp = up
        self.lastSummary = summary
        self.renderStatus()
      }
    }.resume()
  }

  // ——— popover (the pull-down city) ———

  func makeWebView(_ frame: NSRect) -> WKWebView {
    let v = WKWebView(frame: frame, configuration: WKWebViewConfiguration())
    v.setValue(false, forKey: "drawsBackground")
    if let u = URL(string: pageURL) { v.load(URLRequest(url: u)) }
    return v
  }

  func buildPopover() {
    let vc = NSViewController()
    let root = NSView(frame: NSRect(origin: .zero, size: POPOVER_SIZE))
    popWebView = makeWebView(root.bounds)
    popWebView.autoresizingMask = [.width, .height]
    root.addSubview(popWebView)
    vc.view = root
    popover.contentViewController = vc
    popover.contentSize = POPOVER_SIZE
    popover.behavior = .transient   // click away and it's gone — never intrusive
    popover.animates = true
    popover.delegate = self
  }

  @objc func statusClicked() {
    let event = NSApp.currentEvent
    if event?.type == .rightMouseUp || event?.modifierFlags.contains(.control) == true {
      showMenu()
      return
    }
    togglePopover()
  }

  func togglePopover() {
    if popover.isShown { popover.performClose(nil); return }
    guard let button = statusItem.button else { return }
    if !serverUp { startServer() }
    popWebView.evaluateJavaScript("window.__agentopolisPause && window.__agentopolisPause(false)")
    popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    // keyboard shortcuts inside the page need first responder
    popover.contentViewController?.view.window?.makeFirstResponder(popWebView)
  }

  // ——— detached floating panel ———

  @objc func togglePanel() {
    if panel != nil { closePanel(); return }
    popover.performClose(nil)

    var frame = NSRect(x: 0, y: 0, width: 500, height: 380)
    if let saved = UserDefaults.standard.string(forKey: "agentopolis.widget.frame") {
      let r = NSRectFromString(saved)
      if r.width > 260 && r.height > 200 { frame = r }
    } else if let screen = NSScreen.main {
      let v = screen.visibleFrame
      frame.origin = NSPoint(x: v.maxX - frame.width - 24, y: v.maxY - frame.height - 24)
    }

    let p = WidgetPanel(contentRect: frame,
                        styleMask: [.borderless, .nonactivatingPanel, .resizable],
                        backing: .buffered, defer: false)
    p.level = .floating
    p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    p.backgroundColor = .clear
    p.isOpaque = false
    p.hasShadow = true
    p.minSize = NSSize(width: 300, height: 230)
    p.isMovableByWindowBackground = true

    let root = NSView(frame: NSRect(origin: .zero, size: frame.size))
    root.wantsLayer = true
    root.layer?.cornerRadius = 12
    root.layer?.masksToBounds = true
    root.layer?.borderWidth = 1
    root.layer?.borderColor = NSColor(calibratedRed: 0.17, green: 0.19, blue: 0.32, alpha: 1).cgColor
    root.autoresizingMask = [.width, .height]

    let bar = NSView(frame: NSRect(x: 0, y: frame.height - BAR_HEIGHT, width: frame.width, height: BAR_HEIGHT))
    bar.wantsLayer = true
    bar.layer?.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.06, blue: 0.11, alpha: 1).cgColor
    bar.autoresizingMask = [.width, .minYMargin]
    let title = NSTextField(labelWithString: "A G E N T O P O L I S")
    title.font = NSFont.monospacedSystemFont(ofSize: 8, weight: .bold)
    title.textColor = NSColor(calibratedWhite: 0.72, alpha: 1)
    title.frame = NSRect(x: 10, y: 4, width: 200, height: 14)
    bar.addSubview(title)
    let close = NSButton(title: "✕", target: self, action: #selector(togglePanel))
    close.isBordered = false
    close.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
    close.contentTintColor = NSColor(calibratedWhite: 0.65, alpha: 1)
    close.frame = NSRect(x: frame.width - 26, y: 2, width: 22, height: 18)
    close.autoresizingMask = [.minXMargin]
    bar.addSubview(close)

    let wv = makeWebView(NSRect(x: 0, y: 0, width: frame.width, height: frame.height - BAR_HEIGHT))
    wv.autoresizingMask = [.width, .height]
    root.addSubview(wv)
    root.addSubview(bar)
    p.contentView = root
    p.makeKeyAndOrderFront(nil)

    for name in [NSWindow.didMoveNotification, NSWindow.didEndLiveResizeNotification] {
      NotificationCenter.default.addObserver(forName: name, object: p, queue: .main) { _ in
        UserDefaults.standard.set(NSStringFromRect(p.frame), forKey: "agentopolis.widget.frame")
      }
    }
    panel = p
    panelWebView = wv
  }

  func closePanel() {
    if let p = panel { UserDefaults.standard.set(NSStringFromRect(p.frame), forKey: "agentopolis.widget.frame") }
    panelWebView?.loadHTMLString("", baseURL: nil) // drop the SSE connection
    panel?.orderOut(nil)
    panel = nil
    panelWebView = nil
  }

  // ——— server lifecycle ———

  func startServer() {
    guard serverProc == nil || serverProc?.isRunning == false else { return }
    guard let script = argValue("--script") else { return }
    let node = argValue("--node") ?? "/usr/bin/env"
    let p = Process()
    p.executableURL = URL(fileURLWithPath: node)
    p.arguments = node.hasSuffix("env") ? ["node", script, "--no-open"] : [script, "--no-open"]
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    do { try p.run(); serverProc = p } catch { /* menu will show it's down */ }
  }

  @objc func restartServer() {
    serverProc?.terminate()
    serverProc = nil
    // the running instance may not be ours; ask it to exit via its own CLI
    startServer()
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.poll() }
  }

  // ——— login item ———

  var launchesAtLogin: Bool { FileManager.default.fileExists(atPath: plistPath) }

  @objc func toggleLaunchAtLogin() {
    let fm = FileManager.default
    if launchesAtLogin {
      _ = runLaunchctl(["unload", "-w", plistPath])
      try? fm.removeItem(atPath: plistPath)
    } else {
      guard let script = argValue("--script") else { return }
      let node = argValue("--node") ?? "/usr/bin/env"
      let plist = """
      <?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
      <plist version="1.0">
      <dict>
        <key>Label</key><string>dev.agentopolis</string>
        <key>ProgramArguments</key>
        <array>
          <string>\(node)</string>
          <string>\(script)</string>
        </array>
        <key>RunAtLoad</key><true/>
        <key>KeepAlive</key><false/>
        <key>ProcessType</key><string>Interactive</string>
      </dict>
      </plist>
      """
      try? fm.createDirectory(atPath: (plistPath as NSString).deletingLastPathComponent,
                              withIntermediateDirectories: true)
      try? plist.write(toFile: plistPath, atomically: true, encoding: .utf8)
      _ = runLaunchctl(["load", "-w", plistPath])
    }
  }

  func runLaunchctl(_ args: [String]) -> Bool {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/launchctl")
    p.arguments = args
    p.standardOutput = FileHandle.nullDevice
    p.standardError = FileHandle.nullDevice
    do { try p.run(); p.waitUntilExit(); return p.terminationStatus == 0 } catch { return false }
  }

  // ——— menu ———

  @objc func openInBrowser() {
    if let u = URL(string: originURL) { NSWorkspace.shared.open(u) }
  }

  @objc func quit() {
    closePanel()
    NSApp.terminate(nil)
  }

  func showMenu() {
    let menu = NSMenu()
    let working = lastSummary["working"] ?? 0
    let needs = lastSummary["needsYou"] ?? 0
    let header = serverUp
      ? "\(working) working · \(needs) need you"
      : "Server not running"
    let head = NSMenuItem(title: header, action: nil, keyEquivalent: "")
    head.isEnabled = false
    menu.addItem(head)
    menu.addItem(.separator())

    let show = NSMenuItem(title: "Show Office", action: #selector(togglePopoverFromMenu), keyEquivalent: "")
    show.target = self
    menu.addItem(show)

    let keep = NSMenuItem(title: panel == nil ? "Keep on Screen" : "Stop Keeping on Screen",
                          action: #selector(togglePanel), keyEquivalent: "")
    keep.target = self
    menu.addItem(keep)

    let browser = NSMenuItem(title: "Open Full View in Browser", action: #selector(openInBrowser), keyEquivalent: "")
    browser.target = self
    menu.addItem(browser)

    menu.addItem(.separator())
    let login = NSMenuItem(title: "Start at Login", action: #selector(toggleLaunchAtLogin), keyEquivalent: "")
    login.target = self
    login.state = launchesAtLogin ? .on : .off
    menu.addItem(login)

    if !serverUp {
      let restart = NSMenuItem(title: "Start Server", action: #selector(restartServer), keyEquivalent: "")
      restart.target = self
      menu.addItem(restart)
    }

    menu.addItem(.separator())
    let quitItem = NSMenuItem(title: "Quit Agentopolis", action: #selector(quit), keyEquivalent: "q")
    quitItem.target = self
    menu.addItem(quitItem)

    statusItem.menu = menu
    statusItem.button?.performClick(nil)
    statusItem.menu = nil // restore left-click-toggles-popover behavior
  }

  @objc func togglePopoverFromMenu() { togglePopover() }

  // A closed popover must cost nothing: stop the render loop, keep the SSE
  // connection so counts stay live in the menu bar.
  func popoverDidClose(_ notification: Notification) {
    popWebView.evaluateJavaScript("window.__agentopolisPause && window.__agentopolisPause(true)")
  }

  func start() {
    buildPopover()
    if let button = statusItem.button {
      button.target = self
      button.action = #selector(statusClicked)
      button.sendAction(on: [.leftMouseUp, .rightMouseUp])
    }
    renderStatus()
    poll()
    pollTimer = Timer.scheduledTimer(withTimeInterval: POLL_SECONDS, repeats: true) { [weak self] _ in
      self?.poll()
    }
    if argSet.contains("--panel") { togglePanel() }
    if argSet.contains("--show") {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.togglePopover() }
    }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // menu-bar agent: no dock icon, no windows
let controller = Controller()
controller.start()
app.run()
