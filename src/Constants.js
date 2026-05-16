// src/Constants.js
export const UNIT_CATEGORIES = {
  monsters: {
    label: '怪物单位',
    icon: '👹',
    units: {
      boss:     { label: 'Boss',   icon: '💀', color: 0xa855f7, desc: '首领' },
      add:      { label: '小怪',   icon: '👹', color: 0xf97316, desc: '附加怪物' },
      elite:    { label: '精英怪', icon: '🔱', color: 0xef4444, desc: '精英单位' },
      summoned: { label: '召唤物', icon: '🌀', color: 0x8b5cf6, desc: '召唤产物' },
      mobGroup: { label: '怪物群', icon: '👥', color: 0xf97316, desc: '2精英+2小怪' },
    }
  },
  players_role: {
    label: '角色类型',
    icon: '⚔️',
    units: {
      tank:      { label: '坦克',   icon: '🛡️', color: 0x3b82f6, desc: '坦克' },
      healer:    { label: '治疗',   icon: '💚', color: 0x22c55e, desc: '治疗者' },
      dps:       { label: '输出',   icon: '⚔️', color: 0xef4444, desc: '伤害输出' },
      meleeDps:  { label: '近战输出', icon: '⚔️', color: 0xef4444, desc: '近战伤害输出' },
      rangedDps: { label: '远程输出', icon: '🏹', color: 0xf97316, desc: '远程伤害输出' },
      g1:        { label: 'G1',    icon: '🥉', color: 0xcd7f32, desc: '1级单位' },
      g2:        { label: 'G2',    icon: '🥈', color: 0xc0c0c0, desc: '2级单位' },
      g3:        { label: 'G3',    icon: '🥈', color: 0xc0c0c0, desc: '3级单位' },
      g4:        { label: 'G4',    icon: '🥇', color: 0xffd700, desc: '4级单位' },
      g5:        { label: 'G5',    icon: '💎', color: 0x60a5fa, desc: '5级单位' },
    }
  },
  players_class: {
    label: '职业类型',
    icon: '📜',
    units: {
      warrior:      { label: '战士',     icon: '⚔️', color: 0xc79c6e, desc: 'Warrior' },
      paladin:      { label: '圣骑士',   icon: '🛡️', color: 0xf58cba, desc: 'Paladin' },
      deathknight:  { label: '死亡骑士', icon: '💀', color: 0xc41e3a, desc: 'Death Knight' },
      hunter:       { label: '猎人',     icon: '🏹', color: 0xabd473, desc: 'Hunter' },
      shaman:       { label: '萨满',     icon: '🌊', color: 0x0070de, desc: 'Shaman' },
      rogue:        { label: '盗贼',     icon: '🗡️', color: 0xfff569, desc: 'Rogue' },
      druid:        { label: '德鲁伊',   icon: '🌿', color: 0xff7d0a, desc: 'Druid' },
      mage:         { label: '法师',     icon: '🔮', color: 0x69ccf0, desc: 'Mage' },
      warlock:      { label: '术士',     icon: '🔥', color: 0x9482c9, desc: 'Warlock' },
      priest:       { label: '牧师',     icon: '✨', color: 0xffffff, desc: 'Priest' },
    }
  },
  custom: {
    label: '自定义物品',
    icon: '🎒',
    units: {}
  }
};

export const CUSTOM_ITEM_DEFS = [
  { filename: 'TBC鞋',  label: 'TBC鞋',  color: 0x8B4513 },
  { filename: '敲鼓',   label: '敲鼓',   color: 0xDAA520 },
  { filename: '火箭靴', label: '火箭靴', color: 0x4169E1 },
  { filename: '误导',   label: '误导',   color: 0x32CD32 },
  { filename: '自由',   label: '自由',   color: 0x4169E1 },
  { filename: '群嘲',   label: '群嘲',   color: 0xDC143C },
  { filename: '保护',   label: '保护',   color: 0x228B22 },
];

export const DEFAULT_GROUND_WIDTH = 60;
export const DEFAULT_GROUND_HEIGHT = 60;
