'use client'

import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface SidebarToggleProps {
  isCollapsed: boolean
  onToggle: () => void
  className?: string
}

export const SidebarToggle = ({ isCollapsed, onToggle, className }: SidebarToggleProps) => {
  const label = isCollapsed ? 'Show sidebar' : 'Hide sidebar'
  const Icon = isCollapsed ? PanelRightOpen : PanelRightClose

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          onClick={onToggle}
          aria-label={label}
          className={`h-8 w-8 p-0 text-muted-foreground hover:text-foreground ${className ?? ''}`}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}
