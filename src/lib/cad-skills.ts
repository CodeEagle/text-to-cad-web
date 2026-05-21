export const CAD_SKILLS = [
  {
    id: "cad",
    label: "CAD 建模",
    shortLabel: "CAD",
    description: "创建、修改、检查并导出 STEP/STL/3MF/DXF/GLB 等 CAD 模型。",
    instruction:
      "Use the cad skill as the primary workflow for STEP-first build123d/Python CAD generation, validation, and CAD exports."
  },
  {
    id: "render",
    label: "渲染预览",
    shortLabel: "Render",
    description: "启动 CAD Explorer，预览 CAD、机器人描述文件并生成快照。",
    instruction:
      "Use the render skill as the primary workflow for CAD Explorer links, visual review, and saved snapshots. Create or locate a previewable artifact first if the workspace has none."
  },
  {
    id: "step-parts",
    label: "标准件",
    shortLabel: "step.parts",
    description: "查找并下载螺丝、轴承、垫片、连接器等现成 STEP 标准件。",
    instruction:
      "Use the step-parts skill as the primary workflow for finding, evaluating, and downloading hosted off-the-shelf STEP components."
  },
  {
    id: "urdf",
    label: "URDF 机器人",
    shortLabel: "URDF",
    description: "生成和验证 URDF 机器人结构、links、joints、惯量和 mesh 引用。",
    instruction:
      "Use the urdf skill as the primary workflow for robot structure, links, joints, limits, inertials, mesh references, and URDF validation."
  },
  {
    id: "srdf",
    label: "SRDF 规划",
    shortLabel: "SRDF",
    description: "生成 MoveIt2 SRDF 语义、规划组、末端执行器和禁用碰撞配置。",
    instruction:
      "Use the srdf skill as the primary workflow for MoveIt2 semantics, planning groups, end effectors, disabled collisions, and SRDF validation."
  },
  {
    id: "sdf",
    label: "SDF 仿真",
    shortLabel: "SDF",
    description: "生成 SDFormat/SDF 模型或世界，包含 links、joints、传感器和 Gazebo 元数据。",
    instruction:
      "Use the sdf skill as the primary workflow for SDFormat/SDF models, worlds, simulator metadata, validation, and simulator handoff."
  },
  {
    id: "sendcutsend",
    label: "加工审核",
    shortLabel: "SendCutSend",
    description: "按 SendCutSend 的材料、切割、折弯、攻牙等规则审核 DXF/STEP 文件。",
    instruction:
      "Use the sendcutsend skill as the primary workflow for SendCutSend.com upload readiness and manufacturing preflight reports."
  }
] as const;

export type CadSkillId = (typeof CAD_SKILLS)[number]["id"];

export const DEFAULT_CAD_SKILL_ID: CadSkillId = "cad";

export function isCadSkillId(value: unknown): value is CadSkillId {
  return typeof value === "string" && CAD_SKILLS.some((skill) => skill.id === value);
}

export function cadSkillLabel(skillId: string | undefined): string {
  return CAD_SKILLS.find((skill) => skill.id === skillId)?.label ?? CAD_SKILLS[0].label;
}

export function cadSkillShortLabel(skillId: string | undefined): string {
  return CAD_SKILLS.find((skill) => skill.id === skillId)?.shortLabel ?? CAD_SKILLS[0].shortLabel;
}

export function cadSkillInstruction(skillId: string | undefined): string {
  return CAD_SKILLS.find((skill) => skill.id === skillId)?.instruction ?? CAD_SKILLS[0].instruction;
}
