import { useState } from "react";
import {
  GraduationCap, Briefcase, IdCard, Award, CalendarCheck,
  FileText, BookOpen, Building2, UserCheck, BadgeCheck,
  Trophy, ChevronRight, Sparkles, Layout,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import {
  SCHEMA_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type SchemaTemplate,
} from "@/data/SchemaTemplates";
import type { SchemaFieldDef } from "@/services/api/issuer.service";

/**
 * Map of icon name strings to actual Lucide components.
 */
const ICON_MAP: Record<string, React.ElementType> = {
  GraduationCap, Briefcase, IdCard, Award, CalendarCheck,
  FileText, BookOpen, Building2, UserCheck, BadgeCheck, Trophy,
};

interface SchemaBuilderProps {
  /** Called when user selects a template and clicks "Use Template" */
  onSelectTemplate: (name: string, credentialType: string, fields: SchemaFieldDef[]) => void;
  /** Controls dialog visibility from parent */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * SchemaBuilder - Visual template picker for credential schemas.
 *
 * Displays categorized pre-built W3C templates with field previews.
 * Users pick a template, review fields, and apply it to the schema editor.
 */
const SchemaBuilder = ({ onSelectTemplate, open, onOpenChange }: SchemaBuilderProps) => {
  const [selectedTemplate, setSelectedTemplate] = useState<SchemaTemplate | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("education");

  const filteredTemplates = SCHEMA_TEMPLATES.filter((t) => t.category === activeCategory);

  const handleApply = () => {
    if (!selectedTemplate) return;
    onSelectTemplate(
      selectedTemplate.name,
      selectedTemplate.credentialType,
      selectedTemplate.fields.map((f) => ({ ...f }))
    );
    setSelectedTemplate(null);
    onOpenChange(false);
  };

  const getCategoryIcon = (iconName: string) => {
    const Icon = ICON_MAP[iconName] || FileText;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-xl flex items-center gap-2">
            <Layout className="h-5 w-5" style={{ color: "hsl(var(--issuer))" }} />
            Schema Template Library
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Choose a pre-built W3C credential template or create a custom schema from scratch.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Category Tabs */}
          <Tabs value={activeCategory} onValueChange={(v) => { setActiveCategory(v); setSelectedTemplate(null); }}>
            <TabsList className="w-full grid grid-cols-5">
              {TEMPLATE_CATEGORIES.map((cat) => (
                <TabsTrigger key={cat.value} value={cat.value} className="text-xs gap-1.5">
                  {getCategoryIcon(cat.icon)}
                  <span className="hidden sm:inline">{cat.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {TEMPLATE_CATEGORIES.map((cat) => (
              <TabsContent key={cat.value} value={cat.value} className="mt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[25vh] overflow-y-auto pr-1">
                  {SCHEMA_TEMPLATES.filter((t) => t.category === cat.value).map((template) => {
                    const Icon = ICON_MAP[template.icon] || FileText;
                    const isSelected = selectedTemplate?.id === template.id;
                    return (
                      <motion.div
                        key={template.id}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <Card
                          className={`cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? "ring-2 ring-[hsl(var(--issuer))] bg-[hsl(var(--issuer))]/5"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => setSelectedTemplate(template)}
                        >
                          <CardContent className="py-3 px-4">
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  isSelected ? "bg-[hsl(var(--issuer))] text-white" : "bg-muted text-muted-foreground"
                                }`}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm text-foreground truncate">{template.name}</h4>
                                <p className="text-xs text-muted-foreground line-clamp-1">{template.description}</p>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {template.fields.length} fields
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                                    {template.credentialType}
                                  </Badge>
                                </div>
                              </div>
                              {isSelected && (
                                <ChevronRight className="h-4 w-4 text-[hsl(var(--issuer))] shrink-0 mt-1" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Selected Template Preview */}
          <AnimatePresence mode="wait">
            {selectedTemplate && (
              <motion.div
                key={selectedTemplate.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="border border-border rounded-xl p-4 bg-muted/30 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[hsl(var(--issuer))]" />
                    <h3 className="font-semibold text-sm text-foreground">
                      {selectedTemplate.name} — Field Preview
                    </h3>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedTemplate.fields.filter((f) => f.required).length} required
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[20vh] overflow-y-auto pr-1">
                  {selectedTemplate.fields.map((field) => (
                    <div
                      key={field.name}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border text-xs"
                    >
                      <span className="font-medium text-foreground truncate">
                        {field.name.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                      </span>
                      {field.required && <span className="text-destructive shrink-0">*</span>}
                      <span className="ml-auto text-muted-foreground capitalize shrink-0">{field.type}</span>
                    </div>
                  ))}
                </div>

                {/* JSON-LD Preview */}
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    View W3C JSON-LD Schema Preview ▸
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-background border border-border text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-[15vh]">
                    {JSON.stringify(
                      {
                        "@context": ["https://www.w3.org/2018/credentials/v1"],
                        type: ["VerifiableCredential", selectedTemplate.credentialType],
                        credentialSubject: Object.fromEntries(
                          selectedTemplate.fields.map((f) => [
                            f.name,
                            f.type === "number" ? 0 : f.type === "boolean" ? false : f.type === "date" ? "YYYY-MM-DD" : "",
                          ])
                        ),
                      },
                      null,
                      2
                    )}
                  </pre>
                </details>

                <Button variant="issuer" className="w-full gap-2" onClick={handleApply}>
                  <Sparkles className="h-4 w-4" />
                  Use "{selectedTemplate.name}" Template
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SchemaBuilder;
