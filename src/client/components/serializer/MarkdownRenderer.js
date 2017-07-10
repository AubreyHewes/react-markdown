import MDParser from './MDParser'
import {Raw} from 'slate'
import {Record} from 'immutable'


/**
 * String.
 */

const String = new Record({
  kind: 'string',
  text: ''
});

const abbreviations = {};
let hasNewAbbr = false;

/**
 * Rules to (de)serialize nodes.
 *
 * @type {Object}
 */

const RULES = [
  {
    serialize(obj, children) {
      if (obj.kind === 'string') {
        return children
      }
    }
  },
  {
    serialize(obj, children) {
      if (obj.kind !== 'block') return;

      let listLevel = 0;
      let arrChildren, label;

      switch (obj.type) {
        case 'heading1':
          return `# ${children}`;
        case 'heading2':
          return `## ${children}`;
        case 'heading3':
          return `### ${children}`;
        case 'heading4':
          return `#### ${children}`;
        case 'heading5':
          return `##### ${children}`;
        case 'heading6':
          return `###### ${children}`;
        case 'paragraph':
          return `${children}\n`;
        case 'horizontal-rule':
          return `---`;
        case 'hr':
          return `---`;
        case 'code':
          return `\`\`\`\n${children}\n\`\`\`\n`;

        case 'blockquote':
          arrChildren = children.split('\n');
          for (let i = 0; i < arrChildren.length; i++) {
            arrChildren[i] = `> ${arrChildren[i]}`;
          }
          return `\n${arrChildren.join('\n')}`;

        case 'ordered-list':
        case 'unordered-list':
          children = children.replace('\n\n', '\n'); // Delete empty strings in the list
          listLevel = obj.getIn(['data', 'level']);
          arrChildren = children.split('\n');
          for (let i = 0; i < arrChildren.length; i++) {
            if (arrChildren[i] !== '') {
              arrChildren[i] = `    ${arrChildren[i]}`;
            }
          }

          children = arrChildren.join('\n');
          children = children.replace('\n\n', '\n'); // Delete empty strings in the list
          return `\n${children}`;

        case 'list-item':
          let parent = obj.getIn(['data', 'parent']);

          if (parent === 'unordered-list') {
            let pref;

            if (obj.getIn(['data', 'markup'])) {
              pref = obj.getIn(['data', 'markup']);
            }

            else {
              let mod = obj.getIn(['data', 'level']) % 10;
              pref = ['+', '+', '-', '-', '*', '*', '-', '+', '-', '*'][mod];
            }

            return `${pref} ${children}\n`;
          }

          else {
            return `${obj.getIn(['data', 'itemNum'])}. ${children}\n`;
          }

        case 'table':
          return children;
        case 'thead':
          // th tags count ( thead -> tr -> th )
          const columnsCount = obj.nodes.get(0).nodes.size;
          return `${children}|${new Array(columnsCount).fill(' --------- |').join('')}`;
        case 'tbody':
          return `\n${children}`;
        case 'tr':
          return `| ${children}\n`;
        case 'th':
        case 'td':
          return `${children} |`;
        case 'dl-simple':
        case 'dl':
          return children;
        case 'dt-simple':
        case 'dt':
          return `${children}\n`;
        case 'dd-simple':
          return `  ~ ${children}\n`;
        case 'dd':
          arrChildren = children.split('\n');
          for (let i = 0; i < arrChildren.length; i++) {
            if (arrChildren[i] !== '') {
              arrChildren[i] = i === 0 ? `:    ${arrChildren[i]}` : `     ${arrChildren[i]}`;
            }
          }
          children = arrChildren.join('\n');
          return `${children}\n`;
        case 'anchor':
          label = obj.getIn(['data', 'label']);
          return `[^${label}]: ${children}`;
      }
    }
  },
  {
    serialize(obj, children) {
      let title = '';
      if (obj.kind !== 'inline') return;
      switch (obj.type) {
        case 'link':
          return `[${children}](${obj.getIn(['data', 'href'])})`;

        case 'abbr':
          title = obj.getIn(['data', 'title']);
          let key = children;
          if (!abbreviations[key]) {
            abbreviations[key] = {
              title,
              use: false
            };

            hasNewAbbr = true;
          }
          return `${children}`;

        case 'image':
          title = obj.getIn(['data', 'title']);
          let src = obj.getIn(['data', 'src']);
          let alt = obj.getIn(['data', 'alt']);
          return `![${title}](${src} "${alt}")`;
      }
    }
  },
  // Add a new rule that handles marks...
  {
    serialize(obj, children) {
      if (obj.kind !== 'mark') return;
      let markup = obj.getIn(['data', 'markup']);
      switch (obj.type) {
        case 'bold':
          markup = markup ? markup : '**';
          return `${markup}${children}${markup}`;
        case 'italic':
          markup = markup ? markup : '*';
          return `${markup}${children}${markup}`;
        case 'code':
          return `\`${children}\``;
        case 'insert':
          return `++${children}++`;
        case 'sup':
          return `^${children}^`;
        case 'sub':
          return `~${children}~`;
        case 'strikethrough':
          return `~~${children}~~`;
        case 'mark':
          return `==${children}==`;
      }
    }
  }
];


/**
 * Markdown serializer.
 *
 * @type {Markdown}
 */

class Markdown {

  /**
   * Create a new serializer with `rules`.
   *
   * @param {Object} options
   *   @property {Array} rules
   * @return {Markdown} serializer
   */

  constructor(options = {}) {
    this.rules = [
      ...(options.rules || []),
      ...RULES
    ];

    this.serializeNode = this.serializeNode.bind(this);
    this.serializeRange = this.serializeRange.bind(this);
    this.serializeString = this.serializeString.bind(this);
  }


  /**
   * Serialize a `state` object into an HTML string.
   *
   * @param {State} state
   * @return {String} markdown
   */

  serialize(state) {
    const {document} = state;
    const elements = document.nodes.map(this.serializeNode);
    return elements.join('\n').trim();
  }

  /**
   * Serialize a `node`.
   *
   * @param {Node} node
   * @return {String}
   */

  serializeNode(node) {
    if (node.kind === 'text') {
      const ranges = node.getRanges();
      return ranges.map(this.serializeRange);
    }

    let children = node.nodes.map(this.serializeNode);
    children = children.flatten().length === 0 ? '' : children.flatten().join('');

    for (const rule of this.rules) {
      if (!rule.serialize) continue;
      let ret = rule.serialize(node, children);

      if (ret) {
        if (node.data && node.data.get('level') === 0 && hasNewAbbr) {
          for (let key in abbreviations) {
            let abbr = abbreviations[key];
            if (!abbr.use) {
              ret += `*[${key}]: ${abbr.title}\n`;
              abbr.use = true;
            }
          }

          hasNewAbbr = false;
        }

        return ret;
      }

      // if (ret) return ret;
    }
  }

  /**
   * Serialize a `range`.
   *
   * @param {Range} range
   * @return {String}
   */

  serializeRange(range) {
    const string = new String({text: range.text});
    const text = this.serializeString(string);

    return range.marks.reduce((children, mark) => {
      for (const rule of this.rules) {
        if (!rule.serialize) continue;
        const ret = rule.serialize(mark, children);

        if (ret) return ret
      }
    }, text);
  }

  /**
   * Serialize a `string`.
   *
   * @param {String} string
   * @return {String}
   */

  serializeString(string) {
    let strVal = string.text;

    if (strVal.replace) {
      strVal = strVal.replace(
        /^((#+|(> *)+| +\+| +-| +\*| +[0-9]\.| +[0-9]\)| +[a-z]\.| +[a-z]\)| +[A-Z]\.| +[A-Z]\))( |$))/,
        '\\$1'
      );
      strVal = strVal.replace(/(\+\+|\+|--|-|\*\*|\*|`|~~|~|\^)(.+)\1/g, '\\$1$2\\$1');

      strVal = strVal.replace(/©/g, '(C)');
      strVal = strVal.replace(/®/g, '(R)');
      strVal = strVal.replace(/™/g, '(TM)');
      strVal = strVal.replace(/§/g, '(P)');
      strVal = strVal.replace(/±/g, '+-');
      strVal = strVal.replace(/–/g, '--');
      strVal = strVal.replace(/—/g, '---');
      strVal = strVal.replace(/…/g, '...');
    }

    for (const rule of this.rules) {
      if (!rule.serialize) continue;
      const ret = rule.serialize(string, strVal);
      if (ret) return ret;
    }
  }

  /**
   * Deserialize a markdown `string`.
   *
   * @param {String} markdown
   * @return {State} state
   */
  deserialize(markdown) {
    const nodes = MDParser.parse(markdown);
    const state = Raw.deserialize(nodes, {terse: true});
    return state;
  }
}

/**
 * Export.
 */

export default Markdown