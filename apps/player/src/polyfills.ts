// 必须在 React、Zod 和插件之前执行；只补运行路径实际使用的 API。
import 'core-js/actual/global-this';
import 'core-js/actual/queue-microtask';
import 'core-js/actual/structured-clone';
import 'core-js/actual/object/from-entries';
import 'core-js/actual/object/has-own';
import 'core-js/actual/promise/all-settled';
