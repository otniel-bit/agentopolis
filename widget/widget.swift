// Agentopolis desktop widget: a borderless, always-on-top panel hosting the
// city. Compiled locally on first run (no Gatekeeper quarantine), launched by
// `agentopolis`. Usage: agentopolis-widget <url>
import Cocoa
import WebKit

let BAR_HEIGHT: CGFloat = 22

final class WidgetPanel: NSPanel {
  override var canBecomeKey: Bool { true }
}

final class Controller: NSObject {
  let defaults = UserDefaults.standard
  var panel: WidgetPanel!

  @objc func quit() { NSApp.terminate(nil) }

  @objc func openFull() {
    if let url = URL(string: pageURL.replacingOccurrences(of: "?widget=1", with: "")) {
      NSWorkspace.shared.open(url)
    }
  }

  func saveFrame() {
    defaults.set(NSStringFromRect(panel.frame), forKey: "agentopolis.widget.frame")
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // no dock icon — it's a widget

let pageURL = CommandLine.arguments.count > 1
  ? CommandLine.arguments[1]
  : "http://127.0.0.1:4114/?widget=1"

let controller = Controller()

let W: CGFloat = 500, H: CGFloat = 380
var frame = NSRect(x: 0, y: 0, width: W, height: H)
if let saved = UserDefaults.standard.string(forKey: "agentopolis.widget.frame") {
  frame = NSRectFromString(saved)
  if frame.width < 260 || frame.height < 200 { frame.size = NSSize(width: W, height: H) }
} else if let screen = NSScreen.main {
  let v = screen.visibleFrame
  frame.origin = NSPoint(x: v.maxX - W - 24, y: v.maxY - H - 24) // top-right
}

let panel = WidgetPanel(
  contentRect: frame,
  styleMask: [.borderless, .nonactivatingPanel, .resizable],
  backing: .buffered,
  defer: false
)
controller.panel = panel
panel.level = .floating                                   // above normal windows
panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
panel.backgroundColor = .clear
panel.isOpaque = false
panel.hasShadow = true
panel.minSize = NSSize(width: 280, height: 220)

let root = NSView(frame: NSRect(x: 0, y: 0, width: frame.width, height: frame.height))
root.wantsLayer = true
root.layer?.cornerRadius = 14
root.layer?.masksToBounds = true
root.layer?.borderWidth = 1
root.layer?.borderColor = NSColor(calibratedRed: 0.17, green: 0.19, blue: 0.32, alpha: 1).cgColor
root.autoresizingMask = [.width, .height]

// native drag bar: the one place window-dragging always works, since the
// page below owns its own pointer events for pan/zoom
let bar = NSView(frame: NSRect(x: 0, y: frame.height - BAR_HEIGHT, width: frame.width, height: BAR_HEIGHT))
bar.wantsLayer = true
bar.layer?.backgroundColor = NSColor(calibratedRed: 0.05, green: 0.06, blue: 0.11, alpha: 1).cgColor
bar.autoresizingMask = [.width, .minYMargin]

let title = NSTextField(labelWithString: "A G E N T O P O L I S")
title.font = NSFont.monospacedSystemFont(ofSize: 8, weight: .bold)
title.textColor = NSColor(calibratedWhite: 0.75, alpha: 1)
title.frame = NSRect(x: 10, y: 4, width: 200, height: 14)
bar.addSubview(title)

func barButton(_ label: String, x: CGFloat, action: Selector) -> NSButton {
  let b = NSButton(title: label, target: controller, action: action)
  b.isBordered = false
  b.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .regular)
  b.contentTintColor = NSColor(calibratedWhite: 0.65, alpha: 1)
  b.frame = NSRect(x: x, y: 2, width: 22, height: 18)
  b.autoresizingMask = [.minXMargin]
  return b
}
bar.addSubview(barButton("⤢", x: frame.width - 48, action: #selector(Controller.openFull)))
bar.addSubview(barButton("✕", x: frame.width - 26, action: #selector(Controller.quit)))

let config = WKWebViewConfiguration()
let webView = WKWebView(
  frame: NSRect(x: 0, y: 0, width: frame.width, height: frame.height - BAR_HEIGHT),
  configuration: config
)
webView.autoresizingMask = [.width, .height]
webView.setValue(false, forKey: "drawsBackground") // page corners stay rounded
if let url = URL(string: pageURL) {
  webView.load(URLRequest(url: url))
}

root.addSubview(webView)
root.addSubview(bar)
panel.contentView = root
panel.isMovableByWindowBackground = true

// remember where the user put it
var observers: [NSObjectProtocol] = []
for name in [NSWindow.didMoveNotification, NSWindow.didEndLiveResizeNotification] {
  observers.append(NotificationCenter.default.addObserver(
    forName: name, object: panel, queue: .main
  ) { _ in controller.saveFrame() })
}

panel.makeKeyAndOrderFront(nil)
app.run()
