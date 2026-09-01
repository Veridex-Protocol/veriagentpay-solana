// `@nestjs/throttler` is a real dependency and ships its own types. The stub
// that used to live here declared only ThrottlerModule and ThrottlerGuard, and
// because an ambient `declare module` wins over the package's own typings, it
// hid every other export — including `Throttle` and `SkipThrottle`, the
// decorators that apply per-route limits.

declare module '@willsoto/nestjs-prometheus' {
  export const PrometheusModule: any;
}

declare module 'helmet' {
  const helmet: any;
  export default helmet;
}
