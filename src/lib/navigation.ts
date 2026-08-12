import {
  BarChart3,
  Bot,
  Calendar,
  Coins,
  Compass,
  Gauge,
  Globe,
  Grid3x3,
  LayoutGrid,
  LineChart,
  Mail,
  Megaphone,
  Package,
  Percent,
  Search,
  Send,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Table2,
  Tag,
  Target,
  TrendingUp,
  Truck,
  Upload,
  UserCircle,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Small pill rendered after the label, e.g. the AI badge on Tori. */
  badge?: string
}

export interface NavGroup {
  /** Undefined for the top group, which has no heading. */
  heading?: string
  items: NavItem[]
}

/** Mirrors the Metorik sidebar, group for group. */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', to: '/', icon: Compass },
      { label: 'Tori', to: '/tori', icon: Bot, badge: 'AI' },
      { label: 'Orders', to: '/orders', icon: ShoppingCart },
      { label: 'Customers', to: '/customers', icon: Users },
      { label: 'Products', to: '/products', icon: Tag },
      { label: 'Coupons', to: '/coupons', icon: Percent },
      { label: 'Carts', to: '/carts', icon: Package },
    ],
  },
  {
    heading: 'Analyze',
    items: [
      { label: 'Reports', to: '/reports', icon: LineChart },
      { label: 'Cohorts', to: '/cohorts', icon: Grid3x3 },
      { label: 'Goals', to: '/goals', icon: Target },
      { label: 'Digests', to: '/digests', icon: Calendar },
      { label: 'Exports', to: '/exports', icon: Upload },
      { label: 'Costs', to: '/costs', icon: Coins },
      { label: 'Custom Metrics', to: '/custom-metrics', icon: Table2 },
    ],
  },
  {
    heading: 'Engage',
    items: [
      { label: 'Home', to: '/engage', icon: LayoutGrid },
      { label: 'Campaigns', to: '/engage/campaigns', icon: Megaphone },
      { label: 'Profiles', to: '/engage/profiles', icon: UserCircle },
      { label: 'Sent Emails', to: '/engage/sent-emails', icon: Send },
      { label: 'Stats', to: '/engage/stats', icon: BarChart3 },
    ],
  },
  {
    items: [{ label: 'Store Settings', to: '/settings', icon: Settings }],
  },
]

/* --------------------------- Dashboard views --------------------------- */

export type DashboardView =
  | 'overview'
  | 'profit'
  | 'shipping'
  | 'markets'
  | 'ads'
  | 'search'
  | 'markifact'
  | 'insights'

export interface DashboardTab {
  id: DashboardView
  label: string
  icon: LucideIcon
  /**
   * One line under the strip saying what the view answers.
   *
   * Optional: the Overview goes without. It is the view the dashboard opens on
   * and the one whose cards name themselves, so a line describing it was read
   * once and thereafter only took the height.
   */
  blurb?: string
}

/**
 * Cuts of the same period. All but Markets & Traffic are derived from figures
 * the dashboard already loads, so switching to them costs no extra upstream
 * call.
 */
export const DASHBOARD_TABS: DashboardTab[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Compass,
  },
  {
    id: 'profit',
    label: 'Profit & Loss',
    icon: TrendingUp,
    blurb: 'Revenue stepped down through each cost to what is left.',
  },
  {
    id: 'ads',
    label: 'Ad Spend',
    icon: Megaphone,
    blurb: 'Spend across every platform, measured against store revenue.',
  },
  {
    id: 'shipping',
    label: 'Shipping Costs',
    icon: Truck,
    blurb: 'What shipping costs to fulfil, per order and against revenue.',
  },
  {
    id: 'markets',
    label: 'Markets & Traffic',
    icon: Globe,
    // The one tab that costs an extra call — visitors come from the analytics
    // provider, not from the orders already loaded. Worth it here: a country's
    // revenue only means something beside the traffic that produced it.
    blurb: 'Where the visitors come from and where the money does, country by country.',
  },
  {
    id: 'search',
    label: 'Search & Feed',
    icon: Search,
    // Two upstream calls of its own, so it loads only once opened. Organic
    // search and the Shopping feed are halves of one question — how often the
    // store was shown, and whether it was eligible to be.
    blurb: 'Organic search from Search Console, and whether the product feed is serving.',
  },
  {
    id: 'markifact',
    label: 'Markifact',
    icon: Workflow,
    blurb: 'The automation workspace — connections, credits, and what the agents have been running.',
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: Sparkles,
    blurb: 'What the period’s figures add up to, and what to do about it — written by OpenAI on request.',
  },
]

/** Icons re-exported for pages that want to match their nav glyph. */
export { Gauge, Mail, Store, BarChart3 }
