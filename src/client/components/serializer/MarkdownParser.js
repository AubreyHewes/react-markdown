import MarkdownIt from 'js-slate-markdown-serializer';
import MarkdownItSub from 'markdown-it-sub';
import MarkdownItSup from 'markdown-it-sup';
import MarkdownItIns from 'markdown-it-ins';
import MarkdownItMark from 'markdown-it-mark';
import MarkdownItEmoji from 'markdown-it-emoji';
import MarkdownItDeflist from 'markdown-it-deflist';
import MarkdownItAbbr from './plugins/markdown-it-abbr';
import MarkdownItAnchor from './plugins/markdown-it-anchor';
import MarkdownItEmptyLine from './plugins/markdown-it-emptyline';
import MarkdownAutocomplete from './plugins/markdown-it-autocomplete';


const markdown = new MarkdownIt({
  linkify: true,
  typographer: true
});

markdown
  .use(MarkdownItSub)
  .use(MarkdownItSup)
  .use(MarkdownItIns)
  .use(MarkdownItEmoji)
  .use(MarkdownItDeflist)
  .use(MarkdownItAnchor)
  .use(MarkdownItAbbr)
  .use(MarkdownItEmptyLine)
  .use(MarkdownItMark);


const types = {
  'h1': 'heading1',
  'h2': 'heading2',
  'h3': 'heading3',
  'h4': 'heading4',
  'h5': 'heading5',
  'h6': 'heading6',
  'p': 'paragraph',
  'blockquote': 'blockquote',
  'li': 'list-item',
  'ul': 'unordered-list',
  'ol': 'ordered-list',
  'hr': 'horizontal-rule',
  'table': 'table',
  'thead': 'thead',
  'tr': 'tr',
  'th': 'th',
  'tbody': 'tbody',
  'td': 'td',
  'code': 'code',
  'dd': 'dd',
  'dt': 'dt',
  'dl': 'dl',
  'anchor': 'anchor',
  'empty': 'empty',
  'abbr-def': 'abbr-def',
};

const markups = {
  '**': 'bold',
  '__': 'bold',
  '++': 'underline',
  '==': 'mark',
  '*': 'italic',
  '^': 'sup',
  '_': 'italic',
  '~~': 'strikethrough',
  '~': 'sub',
  '`': 'code',
  linkify: 'linkify',
  autocomplete: 'autocomplete'
};

const LISTS_BLOCKQUOTES = new Set(['ordered-list', 'unordered-list', 'blockquote']);
const TABLES = new Set(['table', 'thead', 'tbody']);

function parseAttrs(attrs) {
  let objAttrs = {};

  for (let attr of attrs) {
    objAttrs[attr[0]] = attr[1];
  }

  return objAttrs;
}

class BlockNode {
  constructor(token, isDefault) {
    isDefault = isDefault || false;
    this.kind = "block";
    this.type = isDefault ? 'default' : types[token.tag];
    this.nodes = [];
    this.tag = token.tag;
    this.data = {};

    if ((token.type === 'list_item_open' || token.type === 'hr' || token.type === 'fence')
    &&  token.markup) {
      this.data.markup = token.markup;
    }

    if (token.tag === 'hr' || token.tag === 'empty' || token.tag === 'abbr-def') {
      this.isVoid = true;
    }

    if (token.level === 0 || token.level) {
      this.data.level = token.level;
    }

    if (token.attrs) {
      this.attrs = parseAttrs(token.attrs);

      if (this.attrs.style) {
        this.style = this.attrs.style;
      }
    }

    if (token.meta) {
      this.data = Object.assign(this.data, token.meta);
    }
  }
}

function getBlockNode(token) {
  if (token.tag in types) {
    return new BlockNode(token);
  }

  else {
    return new BlockNode(token, true);
  }
}

class TextNode {
  kind = 'text';
  ranges = [];

  addTextBlock = textBlock => this.ranges.push(textBlock);
}

class InlineNode {
  kind = 'inline';
  isVoid = true;
  nodes = [];
}

class LinkNode extends InlineNode {
  constructor(link, title) {
    super();

    this.type = "link";
    this.isVoid = false;
    this.nodes = [
      {
        kind: "text",
        ranges: [
          {
            "text": ''
          }
        ]
      }
    ];
    this.data = {
      href: link
    };

    if (title !== '') {
      this.data.title = title;
    }
  }

  addText(text) {
    this.nodes[0].ranges[0].text = text;
  }
}

class AbbrNode extends InlineNode {
  constructor(title) {
    super();

    this.type = "abbr";
    this.isVoid = false;
    this.nodes = [
      {
        kind: "text",
        ranges: [
          {
            "text": ''
          }
        ]
      }
    ];
    this.data = {
      title: title
    };
  }

  addText(text) {
    this.nodes[0].ranges[0].text = text;
  }
}

class AutocompleteNode extends InlineNode {
  constructor(id) {
    super();

    this.type = "autocomplete";
    this.isVoid = false;
    this.nodes = [
      {
        kind: "text",
        ranges: [
          {
            "text": ''
          }
        ]
      }
    ];
    this.data = {
      id: id
    };
  }

  addText(text) {
    this.nodes[0].ranges[0].text = text;
  }
}

class ImageNode extends InlineNode {
  constructor(title, src, alt) {
    super();
    this.type = "image";
    this.data = {
      title: title,
      src: src,
    };

    if (alt !== '') {
      this.data.alt = alt;
    }
  }
}

class SoftBreakNode extends InlineNode {
  constructor() {
    super();
    this.type = "softbreak";
  }
}

class TextBlock {
  constructor(token) {
    this.text = '';

    if (token.type === 'emoji') {
      this.marks = [
        {
          type: 'emoji',
          data: {markup: token.markup}
        }
      ];
    }

    else if (token.markup && markups[token.markup]) {
      this.marks = [
        {
          type: markups[token.markup],
          data: {markup: token.markup}
        }
      ];
    }
  }

  setText(text) {
    this.text = text;
  }

  setMarks(marks) {
    this.marks = [];

    for (let mark in marks) {
      if (mark !== '') {
        this.marks.push({
          type: markups[mark],
          data: {markup: mark}
        });
      }
    }
  }
}

class Children {
  constructor(tokens) {
    this._nodes = [];
    this.currNode = null;
    this.currTextBlock = null;
    this.marks = {};

    this.createNodes(tokens);
  }

  get nodes() {
    return this._nodes;
  }

  addCurrNode() {
    if (this.currNode) {
      if (this.currNode.kind === 'text') {
        this.addTextBlock();
      }

      this._nodes.push(this.currNode);
      this.currNode = null;
    }
  }

  addTextBlock() {
    if (this.currTextBlock) {
      this.currNode.addTextBlock(this.currTextBlock);
      this.currTextBlock = null;
    }
  }

  createLink(token) {
    this.addCurrNode();

    let link = '';
    let title = '';

    for (let attr of token.attrs) {
      switch (attr[0]) {
        case 'href':
          link = attr[1];
          break;

        case 'title':
          title = attr[1];
          break;

      }
    }

    this.currNode = new LinkNode(link, title);
  }

  createAbbr(token) {
    this.addCurrNode();

    let title = '';

    for (let attr of token.attrs) {
      if (attr[0] === 'title') {
        title = attr[1];
        break;
      }
    }

    this.currNode = new AbbrNode(title);
  }

  createImage(token) {
    let src = '';
    let alt = '';
    let title = token.content;

    for (let attr of token.attrs) {
      if (attr[0] === 'src') {
        src = attr[1];
      }

      else if (attr[0] === 'title') {
        alt = attr[1];
      }
    }

    this.currNode = new ImageNode(title, src, alt);
    this.addCurrNode();
  }

  createAutocomplete(token) {
    this.addCurrNode();
    this.currNode = new AutocompleteNode(token.meta.id);
    this.currNode.addText(token.content);
    this.addCurrNode();
  }

  createSoftbreak() {
    this.addCurrNode();
    this.currNode = new SoftBreakNode();
    this.addCurrNode();
  }

  addTextToNode(token) {
    const lastElem = getLastElemTokenType(token);

    if (!this.currNode) {
      this.currNode = new TextNode();
    }

    if (token.type === 'code_inline' || token.type === 'emoji') {
      this.addTextBlock();
      this.currTextBlock = new TextBlock(token);
      this.currTextBlock.setText(token.content);
      this.addTextBlock();
    }

    // Add token's mark to this marks
    if (lastElem === 'open') {
      if (token.markup !== '') {
        this.marks[token.markup] = true;
      }
    }

    // Add this marks to text's block
    if (token.type === 'text') {
      this.currTextBlock = new TextBlock(token);
      this.currTextBlock.setText(token.content);

      if (this.marks !== {}) {
        this.currTextBlock.setMarks(this.marks);
      }

      this.addTextBlock();
    }

    // Remove token's mark from this marks
    if (lastElem === 'close') {
      if (token.markup !== '') {
        delete this.marks[token.markup];
      }
    }
  }

  createNodes(tokens) {
    for (let token of tokens) {
      if (token.type === 'link_open') {
        this.createLink(token);
      }

      if (token.type === 'abbr_open') {
        this.createAbbr(token);
      }

      else if (token.type === 'image') {
        this.createImage(token);
      }

      else if (token.type === 'autocomplete') {
        this.createAutocomplete(token);
      }

      else if (token.type === 'softbreak') {
        this.createSoftbreak();
      }

      else if (token.type === 'text' && this.currNode
        &&  (this.currNode.type === 'link' || this.currNode.type === 'abbr')) {
        this.currNode.addText(token.content);
      }

      else if (token.type === 'link_close' || token.type === 'abbr_close') {
        this.addCurrNode();
      }

      else {
        this.addTextToNode(token);
      }
    }

    if (this.currNode) {
      if (this.currTextBlock) {
        this.addTextBlock();
      }

      this.addCurrNode();
    }

    return this._nodes;
  }
}


function getLastElemTokenType(token) {
  const tokenData = token.type.split('_');
  return tokenData[tokenData.length - 1];
}


const StateRender = {
  stack: [],
  level: 0,
  currentBlock: null,
  blocks: [],
  parentBlock: null,

  init() {
    this.stack = [];
    this.level = 0;
    this.currentBlock = null;
    this.blocks = [];
    this.parentBlock = null;
  },

  preprocessing(tokens) {
    let i = 0;
    let blockquoteLevel = 0;
    let bulletListLevel = 0;
    let orderedListLevel = 0;
    let ddLevel = 0;
    let anchorLevel = 0;

    while (i + 1 < tokens.length) {
      let token = tokens[i];

      if (token.type === 'empty' && token.level > 0) {
        tokens.splice(i, 1);
      }

      else if ((blockquoteLevel > 0 || bulletListLevel > 0
        ||  orderedListLevel > 0 || ddLevel > 0 || anchorLevel > 0)
        && (token.type === 'paragraph_open' || token.type === 'paragraph_close')) {
        tokens.splice(i, 1);
      }

      else if (bulletListLevel > 1
        && token.type === 'bullet_list_close' && tokens[i + 1].type === 'bullet_list_open') {
        tokens.splice(i, 2);
      }

      else {
        if (token.type === 'blockquote_open') {
          blockquoteLevel++;
        }

        else if (token.type === 'blockquote_close') {
          blockquoteLevel--;
        }

        else if (token.type === 'bullet_list_open') {
          bulletListLevel++;
        }

        else if (token.type === 'bullet_list_close') {
          bulletListLevel--;
        }

        else if (token.type === 'ordered_list_open') {
          orderedListLevel++;
        }

        else if (token.type === 'ordered_list_close') {
          orderedListLevel--;
        }

        else if (token.type === 'dd_open') {
          ddLevel++;
        }

        else if (token.type === 'dd_close') {
          ddLevel--;
        }

        else if (token.type === 'anchor_open') {
          anchorLevel++;
        }

        else if (token.type === 'anchor_close') {
          anchorLevel--;
        }

        else if (token.type === 'code_block' || token.type === 'fence') {
          token.content = token.content.replace(/\n$/, '');
        }

        i++;
      }
    }
  },

  childrenHandler(token, parentType) {
    let parent = token.type;
    let num = token.type === 'ordered-list' && token.attrs && token.attrs.start ? token.attrs.start : 1;

    for (let item of token.nodes) {
      if (!item.data) {
        item.data = {};
      }

      if (LISTS_BLOCKQUOTES.has(parent)) {
        item.data.parent = parent;
      }

      else if (parentType === 'blockquote'){
        item.data.parent = parentType;
      }

      if (token.type === 'ordered-list') {
        item.data.itemNum = num++;
      }

      if (item.nodes) {
        this.postprocessing(item.nodes, item.data.parent);
        // this.postprocessing(item.nodes, parent);
      }
    }

    return parent;
  },

  setRecursiveParent(nodes, parent) {
    for (let item of nodes) {
      if (!item.data) {
        item.data = {};
      }

      item.data.parent = parent;

      if (item.nodes) {
        if (TABLES.has(item.type)) {
          this.setRecursiveParent(item.nodes, item.type);
        }

        else {
          this.setRecursiveParent(item.nodes, parent);
        }
      }
    }
  },

  postprocessing(tokens) {
    for (let token of tokens) {
      let parent = '';

      switch (token.type) {
        case 'table':
        case 'thead':
        case 'tbody':
          parent = token.type;
          this.setRecursiveParent(token.nodes, parent);
          break;

        case 'ordered-list':
        case 'unordered-list':
        case 'blockquote':
          parent = token.type;
          let num = token.type === 'ordered-list' && token.attrs && token.attrs.start ? token.attrs.start : 1;

          this.setRecursiveParent(token.nodes, parent);

          for (let item of token.nodes) {
            if (!item.data) {
              item.data = {};
            }

            if (token.type === 'ordered-list') {
              item.data.itemNum = num++;
            }

            if (item.nodes) {
              this.postprocessing(item.nodes);
            }
          }

          break;

        case 'dl':
          let isSimple = true;

          for (let item of token.nodes) {
            if(item.type === 'dd' && item.nodes.length > 1) {
              isSimple = false;
              break;
            }
          }

          if (isSimple) {
            token.type = 'dl-simple';

            for (let item of token.nodes) {
              switch (item.type) {
                case 'dt':
                  item.type = 'dt-simple';
                  break;
                case 'dd':
                  item.type = 'dd-simple';
                  item.nodes = item.nodes[0].nodes; // remove p-wrapper

                  break;
              }
            }
          }
          break;
      }
    }
  },

  saveCurrentBlock() {
    if (this.currentBlock) {
      if (this.parentBlock) {
        this.parentBlock.nodes.push(this.currentBlock);
      }

      else {
        this.blocks.push(this.currentBlock);
      }

      this.currentBlock = null;
    }
  },

  moveParentBlockToCurrent() {
    if (this.parentBlock) {
      this.currentBlock = this.parentBlock;
      this.parentBlock = null;
    }

    if (this.stack.length > 0) {
      this.parentBlock = this.stack.pop();
    }
  },

  createBlock(token) {
    if (this.currentBlock) {
      if (this.parentBlock) {
        this.stack.push(this.parentBlock);
      }

      this.parentBlock = this.currentBlock;
    }

    this.currentBlock = getBlockNode(token);
    this.level++;
  },

  addInlineToBlock(token) {
    let node = getBlockNode(token);

    if (token.children) {
      node.nodes = new Children(token.children).nodes;
    }

    this.currentBlock.nodes.push(node);
  },

  addInlineText(token) {
    if (token.children) {
      this.currentBlock.nodes = new Children(token.children).nodes;
    }
  },

  closeBlock() {
    this.level--;
    this.saveCurrentBlock();
    this.moveParentBlockToCurrent();
  },

  addCodeBlock(token) {
    let blockNode = getBlockNode(token);
    let textNode = new TextNode();
    let textBlock = new TextBlock({});
    textBlock.setText(token.content);
    textNode.addTextBlock(textBlock);
    blockNode.nodes.push(textNode);

    if (this.level === 0) {
      this.currentBlock = blockNode;
      this.saveCurrentBlock();
    }

    else {
      this.currentBlock.nodes.push(blockNode);
    }
  },

  addHRBlock(token) {
    this.currentBlock = getBlockNode(token);
    this.saveCurrentBlock();
  },

  processing(tokens) {
    let previousType = '';
    for (let token of tokens) {
      if (token.type) {
        const lastElem = getLastElemTokenType(token);

        if (lastElem === 'open') {
          this.createBlock(token);
        }

        else if (token.type === 'inline' && previousType !== 'empty') {
          if (this.currentBlock.type === 'dd' || this.currentBlock.type === 'blockquote') {
            token.tag = 'p';
            this.addInlineToBlock(token);
          }

          else {
            this.addInlineText(token);
          }
        }

        else if (lastElem === 'close') {
          this.closeBlock();
        }

        else if (token.tag === 'code') {
          this.addCodeBlock(token);
        }

        else if (token.type === 'hr' || token.type === 'empty' || token.type === 'abbr-def') {
          this.addHRBlock(token);
        }
      }

      previousType = token.type;
    }
  },

  parse(tokens) {
    this.preprocessing(tokens);
    this.processing(tokens);
    this.postprocessing(this.blocks);

    // console.log('markdown it:\n', JSON.stringify(tokens));
    // console.log(' ');
    // console.log(' ');
    // console.log('StateRender:');
    // console.log(JSON.stringify(this.blocks));
    // console.log(' ');
    // console.log(' ');

    return this.blocks;
  },

  render(markdownData, rules = []) {
    this.init();

    const markdownAutocomplete = new MarkdownAutocomplete(rules);
    markdown.use(markdownAutocomplete);

    let tokens = markdown.parse(markdownData || '');

    return this.parse(tokens);
  }
};


const hasOwnProperty = Object.prototype.hasOwnProperty;

const assign = Object.assign || function (obj) {
    for (let i = 1; i < arguments.length; i++) {
      let target = arguments[i];
      for (let key in target) {
        if (hasOwnProperty.call(target, key)) {
          obj[key] = target[key];
        }
      }
    }
    return obj;
  };


let defaults = {
  silent: false,
};

const MDParser = {
  parse(src, options = []) {
    let fragment = null;

    if (src === '') {
      fragment = [{
        kind: "block",
        type: "paragraph",
        nodes: [
          {
            kind: "text",
            ranges: [
              {
                text: ""
              }
            ]
          }
        ]
      }];
    }

    else {
      try {
        fragment = StateRender.render(src, options);
      }

      catch (e) {
        fragment = [{
          kind: "block",
          type: "paragraph",
          nodes: [
            {
              kind: "text",
              ranges: [
                {
                  text: ""
                }
              ]
            }
          ]
        }];
      }
    }

    return {nodes: fragment};
  },
};

export default MDParser;
