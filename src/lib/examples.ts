import type { CadSkillId } from "./cad-skills";

export type PromptExample = {
  id: string;
  skillId: CadSkillId;
  previewImage?: string;
  upstreamReferencePaths?: string[];
  title: string;
  prompt: string;
};

export const PROMPT_EXAMPLES: PromptExample[] = [
  {
    id: "rectangular-calibration-block",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_01_rectangular_calibration_block.jpg",
    upstreamReferencePaths: [
      "benchmarks/01-rectangular-calibration-block.md",
      "benchmarks/benchmark_01_rectangular_calibration_block.gif"
    ],
    title: "矩形校准块",
    prompt:
      "Create a centered 100 x 60 x 20 mm rectangular calibration block with four 8 mm vertical through holes. Add 2 mm chamfers only to the top outside perimeter and export STEP, STL, and a README."
  },
  {
    id: "circular-flange",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_02_circular_flange.jpg",
    upstreamReferencePaths: [
      "benchmarks/02-circular-flange.md",
      "benchmarks/benchmark_02_circular_flange.gif"
    ],
    title: "圆形法兰",
    prompt:
      "Create an 80 mm diameter, 10 mm thick circular flange with a 30 mm center through hole. Add six 6 mm through holes on a 60 mm bolt circle and fillet the outside circular edge."
  },
  {
    id: "l-bracket",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_03_l_bracket.jpg",
    upstreamReferencePaths: [
      "benchmarks/03-l-bracket.md",
      "benchmarks/benchmark_03_l_bracket.gif"
    ],
    title: "带加强筋 L 支架",
    prompt:
      "Create an L bracket with a base plate and rear vertical plate. Add vertical mounting holes in the base, horizontal mounting holes in the back plate, two triangular gussets, and filleted transitions where the plates meet."
  },
  {
    id: "stepped-shaft-keyway",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_04_stepped_shaft_keyway.jpg",
    upstreamReferencePaths: [
      "benchmarks/04-stepped-shaft-keyway.md",
      "benchmarks/benchmark_04_stepped_shaft_keyway.gif"
    ],
    title: "带键槽阶梯轴",
    prompt:
      "Create a 120 mm long stepped shaft along the X axis with three sections of 20/30/20 mm diameter. Add end chamfers and a shallow rectangular keyway on the top of the middle section."
  },
  {
    id: "electronics-enclosure",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_05_open_top_electronics_enclosure.jpg",
    upstreamReferencePaths: [
      "benchmarks/05-open-top-electronics-enclosure.md",
      "benchmarks/benchmark_05_open_top_electronics_enclosure.gif"
    ],
    title: "开口电子外壳",
    prompt:
      "Create an open-top electronics enclosure with 3 mm wall and floor thickness. Add four internal standoffs with centered blind holes, and add 2 mm fillets to the outside vertical corners."
  },
  {
    id: "clevis-bracket",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_06_clevis_bracket_lightening_cutouts.jpg",
    upstreamReferencePaths: [
      "benchmarks/06-clevis-bracket-lightening-cutouts.md",
      "benchmarks/benchmark_06_clevis_bracket_lightening_cutouts.gif"
    ],
    title: "轻量化叉耳支架",
    prompt:
      "Create a symmetric clevis bracket with a base plate, two rounded lugs, base mounting holes, and a horizontal lug pin hole. Add triangular lightening cutouts, reinforcing ribs, and filleted transitions."
  },
  {
    id: "engine-cylinder",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_07_radial_engine_cylinder.jpg",
    upstreamReferencePaths: [
      "benchmarks/07-radial-engine-cylinder.md",
      "benchmarks/benchmark_07_radial_engine_cylinder.gif"
    ],
    title: "径向发动机气缸",
    prompt:
      "Create a vertical radial-engine cylinder form with a central barrel, 12 cooling fins, a bottom flange, and a top cap. Add a spark-plug boss tilted 35 degrees with a coaxial through hole."
  },
  {
    id: "centrifugal-impeller",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_08_centrifugal_impeller.jpg",
    upstreamReferencePaths: [
      "benchmarks/08-centrifugal-impeller.md",
      "benchmarks/benchmark_08_centrifugal_impeller.gif"
    ],
    title: "离心叶轮",
    prompt:
      "Create a centrifugal impeller with a back plate, hub, and center bore. Add 12 blended backward-curved blades, each sweeping about 45 degrees from root to tip."
  },
  {
    id: "spiral-staircase",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_09_spiral_staircase.jpg",
    upstreamReferencePaths: [
      "benchmarks/09-spiral-staircase.md",
      "benchmarks/benchmark_09_spiral_staircase.gif"
    ],
    title: "螺旋楼梯",
    prompt:
      "Create a miniature spiral staircase with a center column, base disk, and 20 wedge-shaped treads rising step by step. Add a spiral handrail and vertical balusters at the outer end of the treads."
  },
  {
    id: "planetary-gear-stage",
    skillId: "cad",
    previewImage: "/demo-previews/benchmark_10_planetary_gear_stage.jpg",
    upstreamReferencePaths: [
      "benchmarks/10-planetary-gear-stage.md",
      "benchmarks/benchmark_10_planetary_gear_stage.gif",
      "docs/public/hero/planetary_gear_assembly.step.glb",
      "docs/public/hero/planetary_gear_assembly.step.js"
    ],
    title: "行星齿轮级",
    prompt:
      "Create a flat planetary gear stage with separate sun gear, planet gears, ring gear, carrier, and pins. Use simplified trapezoidal teeth and place three planet gears around the sun on a 42 mm radius circle. Export a STEP assembly and create a colocated CAD Explorer STEP runtime sidecar named .planetary_gear_stage.step.js with labeled feature refs, a drive angle parameter, and a looping mesh-cycle animation that rotates the sun, carrier, planets, and pins with fixed-ring planetary kinematics."
  },
  {
    id: "render-review",
    skillId: "render",
    previewImage: "/demo-previews/text-to-cad-demo.jpg",
    upstreamReferencePaths: ["assets/text-to-cad-demo.gif"],
    title: "CAD Explorer 复查快照",
    prompt:
      "Use the render skill to open the current previewable CAD file in CAD Explorer and save one review snapshot. If the current directory has no previewable file, first create a simple 40 x 30 x 12 mm test bracket STEP file and then render it."
  },
  {
    id: "step-parts-screw-kit",
    skillId: "step-parts",
    upstreamReferencePaths: ["skills/step-parts/references/step-parts-api.md"],
    title: "M3 紧固件标准件包",
    prompt:
      "Use the step.parts skill to find and download STEP standard parts for an M3 x 12 socket head cap screw, an M3 washer, and an M3 hex nut. Output the downloaded STEP files and a README explaining the selected part numbers, dimensions, and rationale."
  },
  {
    id: "urdf-two-link-arm",
    skillId: "urdf",
    previewImage: "/demo-previews/urdf-demo.jpg",
    upstreamReferencePaths: ["assets/urdf-demo.gif"],
    title: "精细二连杆机械臂",
    prompt:
      "Use the official earthtojake/text-to-cad URDF demo visual target from assets/urdf-demo.gif and the bundled preview image as the reference target. Recreate that demo robot package faithfully with CAD-generated mesh visuals when possible, then use the URDF skill to output a URDF with matching links, joints, mesh-based visual geometry, simplified primitive collision geometry, reasonable limits, inertials, validation notes, and a README explaining how the mesh visuals map to the URDF links. Do not substitute an unrelated generic two-link arm if the reference target differs."
  },
  {
    id: "srdf-two-link-planning",
    skillId: "srdf",
    previewImage: "/demo-previews/srdf-moveit2-demo.jpg",
    upstreamReferencePaths: ["assets/srdf-moveit2-demo.gif", "assets/urdf-demo.gif"],
    title: "MoveIt2 规划语义",
    prompt:
      "Use the official earthtojake/text-to-cad SRDF MoveIt2 demo visual target from assets/srdf-moveit2-demo.gif and the bundled preview image as the reference target. First create or reuse the matching URDF robot package for that same target, then use the SRDF skill to create MoveIt2 semantic configuration on top of the linked URDF. Include an arm planning group, tool end effector, home group state, virtual joint, disabled collisions, validation notes, and a README. SRDF owns only planning semantics, so keep geometry in the matching URDF and meshes; do not generate a new unrelated two-link robot."
  },
  {
    id: "sdf-differential-drive",
    skillId: "sdf",
    upstreamReferencePaths: ["skills/sdf/references/examples.md", "skills/sdf/references/interoperability.md"],
    title: "差速小车 SDF",
    prompt:
      "Use the SDF skill and its official examples/interoperability references to generate a Gazebo differential-drive cart model with a chassis, left and right wheels, caster, inertials, collision bodies, visual geometry, and differential-drive plugin configuration. Use only SDF joint and geometry constructs that CAD Explorer can preview faithfully or document simulator-only metadata separately. Output the .sdf file, generator source, and validation notes."
  },
  {
    id: "sendcutsend-bracket-preflight",
    skillId: "sendcutsend",
    upstreamReferencePaths: [
      "skills/sendcutsend/references/official-sources.md",
      "skills/sendcutsend/references/report-template.md"
    ],
    title: "钣金支架加工审核",
    prompt:
      "Use the SendCutSend skill to prepare an upload preflight report for a 2 mm 6061 aluminum laser-cut L-shaped mounting bracket. If no input file exists, first generate a simple DXF/STEP design, then check cutting, bending, hole sizes, chamfers, material, and service availability."
  }
];
