import Capacitor
import UIKit
import WebKit

final class SproutViewController: CAPBridgeViewController {
    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeLeft }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if #available(iOS 16.0, *) {
            setNeedsUpdateOfSupportedInterfaceOrientations()
            view.window?.windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: .landscape)) { error in
                NSLog("Sprout landscape window: %@", error.localizedDescription)
            }
        }
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SproutScreenPlugin())
        webView?.backgroundColor = UIColor(red: 253 / 255, green: 246 / 255, blue: 236 / 255, alpha: 1)
        webView?.isOpaque = false
        guard let url = Bundle.main.url(forResource: "sprout-native-runtime", withExtension: "js"),
              let script = try? String(contentsOf: url, encoding: .utf8) else {
            assertionFailure("Missing Sprout native runtime")
            return
        }
        webView?.configuration.userContentController.addUserScript(
            WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )
    }
}

@objc(SproutScreenPlugin)
final class SproutScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "SproutScreenPlugin"
    let jsName = "SproutScreen"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "setAwake", returnType: CAPPluginReturnPromise)]
    private var observers: [NSObjectProtocol] = []

    override func load() {
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { _ in
            UIApplication.shared.isIdleTimerDisabled = false
        })
        observers.append(NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.bridge?.webView?.evaluateJavaScript(
                "window.dispatchEvent(new Event('sprout:native-resume'));", completionHandler: nil
            )
        })
    }

    @objc func setAwake(_ call: CAPPluginCall) {
        guard let awake = call.getBool("awake") else {
            call.reject("awake must be a boolean")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = awake && UIApplication.shared.applicationState == .active
            call.resolve()
        }
    }

    deinit {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
    }
}
