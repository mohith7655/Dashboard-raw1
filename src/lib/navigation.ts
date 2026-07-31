import {
  BarChart3,
  Bot,
  Calendar,
  Coins,
  Compass,
  Gauge,
  Grid3x3,
  LayoutGrid,
  LineChart,
  Mail,
  Megaphone,
  Package,
  Percent,
  Send,
  Settings,
  ShoppingCart,
  Store,
  Table2,
  Tag,
  Target,
  Upload,
  UserCircle,
  Users,
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

/** Icons re-exported for pages that want to match their nav glyph. */
export { Gauge, Mail, Store, BarChart3 }
