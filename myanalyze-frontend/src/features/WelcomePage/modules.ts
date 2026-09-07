// Lista wszystkich dostępnych modułów dla WelcomePage
export interface WelcomeModule {
  key: string;
  name: string;
  icon: string;
  description: string;
  order_index: number;
  route: string;
  visible?: string; // Optional for config merging, "1"/"0"
}

export interface ConfiguredWelcomeModule extends WelcomeModule {
  visible: string;
}

export function normalizeModuleOrder(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const ALL_MODULES: WelcomeModule[] = [
  {
    key: "manager",
    name: "Manager Finansów",
    icon: "fa-solid fa-wallet",
    description: "Konta, przychody i wydatki w jednym miejscu",
    order_index: 1,
    route: "/manager",
    visible: "1"
  },
  {
    key: "logi",
    name: "Logi aplikacji",
    icon: "fa-solid fa-cog",
    description: "Aktywność w aplikacji",
    order_index: 2,
    route: "/app-activity-log",
  },
  {
    key: "config",
    name: "Konfiguracja",
    icon: "fa-solid fa-gear",
    description: "Ustawienia i konfiguracja aplikacji",
    order_index: 3,
    route: "/konfiguracja",
    visible: "1"
  },
];

export function mergeModuleConfiguration(configFromApi: Partial<WelcomeModule>[]): ConfiguredWelcomeModule[] {
  const apiMap = new Map(configFromApi.filter((module) => module.key).map((module) => [module.key, module]));
  return ALL_MODULES.map((module) => {
    const savedModule = apiMap.get(module.key);
    return {
      ...module,
      ...savedModule,
      visible: typeof savedModule?.visible === "string" ? savedModule.visible : module.visible ?? "1",
      order_index: normalizeModuleOrder(savedModule?.order_index, module.order_index),
      icon: typeof savedModule?.icon === "string" ? savedModule.icon : module.icon,
    };
  });
}
