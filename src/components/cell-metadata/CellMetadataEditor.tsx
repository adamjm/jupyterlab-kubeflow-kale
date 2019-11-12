import * as React from "react";
import { Notebook, NotebookPanel } from "@jupyterlab/notebook";
import { MaterialInput, MaterialSelect, MaterialSelectMulti } from "../Components";
import CellUtils from "../../utils/CellUtils";
import { ICellModel, isCodeCellModel, CellModel } from "@jupyterlab/cells";
import { findDOMNode } from 'react-dom';
import EditIcon from '@material-ui/icons/Edit';
import CloseIcon from '@material-ui/icons/Close';
import ColorUtils from './ColorUtils';

const KUBEFLOW_CELL_METADATA_KEY = 'kubeflow_cell';

const CELL_TYPES = [
    { value: 'imports', label: 'Imports' },
    { value: 'functions', label: 'Functions' },
    { value: 'pipeline-parameters', label: 'Pipeline Parameters' },
    { value: 'step', label: 'Pipeline Step' },
    { value: 'skip', label: 'Skip Cell' }
];

const RESERVED_CELL_NAMES = ['imports', 'functions', 'pipeline-parameters', 'skip'];
const RESERVED_CELL_NAMES_HELP_TEXT: { [id: string]: string; } = {
    "imports": "The code in this cell will be pre-pended to every step of the pipeline.",
    "functions": "The code in this cell will be pre-pended to every step of the pipeline, after `imports`.",
    "pipeline-parameters": "The variables in this cell will be transformed into pipeline parameters, preserving the current values as defaults.",
    "skip": "This cell will be skipped and excluded from pipeline steps"
};

interface IProps {
    notebook: NotebookPanel;
    activeCellIndex: number;
    cellModel: ICellModel;
    stepName?: string;
    cellMetadata?: any;
}

interface IState {
    showEditor: boolean;
    currentActiveCellMetadata: IKaleCellMetadata;
    allBlocks?: string[];
    prevBlockName?: string;
    wrapperClass?: string;
}

interface IKaleCellMetadata {
    blockName: string;
    prevBlockNames?: string[]
}

const DefaultCellMetadata: IKaleCellMetadata = {
    blockName: '',
    prevBlockNames: []
};

const DefaultState: IState = {
    showEditor: false,
    allBlocks: [],
    currentActiveCellMetadata: DefaultCellMetadata,
    prevBlockName: null,
    wrapperClass: '',
};

export class CellMetadataEditor extends React.Component<IProps, IState> {
    state = DefaultState;

    componentDidMount() {
        if (this.props.cellModel && isCodeCellModel(this.props.cellModel)) {
            this.updateClassName()
            this.readAndShowMetadata();
            this.moveEditor();
        }
    };

    componentWillUnmount() {
        const editor = document.querySelector(`.kale-metadata-editor-wrapper-${this.props.activeCellIndex}`)
        // findDOMNode is null here
        if (editor) {
            editor.remove();
        }
    }

    updateCurrentCellType = async (value: string) => {
        if (RESERVED_CELL_NAMES.includes(value)) {
            await this.updateCurrentBlockName(value)
        } else {
            await this.updateCurrentBlockName('');
            await this.updatePrevBlocksNames([]);
            await this.setState({ prevBlockName: this.getPreviousBlock(this.props.notebook.content, this.props.activeCellIndex) })
        }
    };

    moveEditor() {
        // https://stackoverflow.com/questions/43435881/should-i-use-ref-or-finddomnode-to-get-react-root-dom-node-of-an-element
        // https://reactjs.org/docs/react-dom.html#finddomnode
        // https://medium.com/trabe/getting-rid-of-finddomnode-method-in-your-react-application-a0d7093b2660

        const metadataWrapper = this.props.notebook.content.node.childNodes[this.props.activeCellIndex] as HTMLElement;
        const editor = findDOMNode(this).firstChild as Element
        if (metadataWrapper && editor && !editor.classList.contains('moved')) {
            editor.classList.add('moved');
            metadataWrapper.insertAdjacentElement('afterbegin', editor);
        }
    }

    componentDidUpdate = async (prevProps: Readonly<IProps>, prevState: Readonly<IState>) => {
        try {
            if (prevProps.cellMetadata.prevBlockNames.join() !== this.props.cellMetadata.prevBlockNames.join()) {
                // console.log(prevProps, this.props)
                this.updateClassName()
                this.readAndShowMetadata();
            }
        } catch (error) {
            console.error(error);
        }
    };

    updateClassName = () => {
        let c = `kale-metadata-editor-wrapper kale-metadata-editor-wrapper-${this.props.activeCellIndex}`;
        this.setState({ wrapperClass: c })
    }

    readAndShowMetadata = () => {
        // 1. Read metadata from the active cell
        // const cellMetadata = this.getKaleCellTags(
        //     this.props.notebook.content,
        //     this.props.activeCellIndex,
        //     KUBEFLOW_CELL_METADATA_KEY);
        const allBlocks = this.getAllBlocks(this.props.notebook.content);
        const prevBlockName = this.getPreviousBlock(this.props.notebook.content, this.props.activeCellIndex);

        if (this.props.cellMetadata) {
            this.setState({
                allBlocks: allBlocks,
                prevBlockName: prevBlockName,
                currentActiveCellMetadata: {
                    blockName: this.props.cellMetadata.blockName || '',
                    prevBlockNames: this.props.cellMetadata.prevBlockNames || []
                }
            })
        } else {
            this.setState({
                allBlocks: allBlocks,
                prevBlockName: prevBlockName,
                currentActiveCellMetadata: DefaultCellMetadata,
            })
        }
    };

    getPreviousBlock = (notebook: Notebook, current: number): string => {
        for (let i = current - 1; i >= 0; i--) {
            let mt = this.getKaleCellTags(notebook, i, KUBEFLOW_CELL_METADATA_KEY);
            if (mt && mt.blockName && mt.blockName !== 'skip' && mt.blockName !== "") {
                return mt.blockName
            }
        }
        return null
    };

    getAllBlocks = (notebook: Notebook): string[] => {
        let blocks = new Set<string>();
        for (const idx of Array(notebook.model.cells.length).keys()) {
            let mt = this.getKaleCellTags(notebook, idx, KUBEFLOW_CELL_METADATA_KEY);
            if (mt && mt.blockName && mt.blockName !== '') {
                blocks.add(mt.blockName);
            }
        }
        return Array.from(blocks)
    };

    updateCurrentBlockName = async (value: string) => {
        const oldBlockName: string = this.state.currentActiveCellMetadata.blockName;
        let currentCellMetadata = { ...this.state.currentActiveCellMetadata, blockName: value };
        await this.setState({ currentActiveCellMetadata: currentCellMetadata });
        this.setKaleCellTags(
            this.props.notebook,
            this.props.activeCellIndex,
            KUBEFLOW_CELL_METADATA_KEY,
            currentCellMetadata,
            true
        );
        this.updateKaleCellTags(
            this.props.notebook,
            oldBlockName,
            value
        );
    };

    updatePrevBlocksNames = async (previousBlocks: string[]) => {
        let currentCellMetadata = { ...this.state.currentActiveCellMetadata, prevBlockNames: previousBlocks };
        await this.setState({ currentActiveCellMetadata: currentCellMetadata });
        this.setKaleCellTags(
            this.props.notebook,
            this.props.activeCellIndex,
            KUBEFLOW_CELL_METADATA_KEY,
            currentCellMetadata,
            true
        )
    };

    getKaleCellTags = (
        notebook: Notebook,
        index: number,
        key: string) => {
        const tags: string[] = CellUtils.getCellMetaData(
            notebook,
            index,
            'tags'
        );
        if (tags) {
            let b_name = tags.map(v => {
                if (RESERVED_CELL_NAMES.includes(v)) {
                    return v
                }
                if (v.startsWith('block:')) {
                    return v.replace("block:", "")
                }
            });

            let prevs = tags.filter(v => { return v.startsWith('prev:') })
                .map(v => { return v.replace("prev:", '') });
            return {
                blockName: b_name[0],
                prevBlockNames: prevs
            }
        }
        return null;
    };

    setKaleCellTags = (
        notebookPanel: NotebookPanel,
        index: number,
        key: string,
        value: IKaleCellMetadata,
        save: boolean) => {
        // make the dict to save to tags
        let nb = value.blockName;
        // not a reserved name
        if (!RESERVED_CELL_NAMES.includes(value.blockName)) {
            nb = 'block:' + nb
        }
        console.log('set kale cell tags');
        console.log(nb);
        const tags = [nb].concat(value.prevBlockNames.map(v => 'prev:' + v));
        console.log(tags);
        console.warn('setKaleCellTags');
        CellUtils.setCellMetaData(
            notebookPanel,
            index,
            'tags',
            tags,
            save
        )
    };

    updateKaleCellTags = (
        notebookPanel: NotebookPanel,
        oldBlockName: string,
        newBlockName: string) => {
        let i: number;
        for (i = 0; i < notebookPanel.model.cells.length; i++) {
            const tags: string[] = CellUtils.getCellMetaData(
                notebookPanel.content,
                i,
                'tags'
            );
            let newTags: string[] = (tags || []).map(t => {
                if (t === 'prev:' + oldBlockName) {
                    return RESERVED_CELL_NAMES.includes(newBlockName) ? '' : 'prev:' + newBlockName;
                } else {
                    return t;
                }
            }).filter(t => t !== '' && t !== 'prev:');
            console.warn('updateKaleCellTags');
            CellUtils.setCellMetaData(
                notebookPanel,
                i,
                'tags',
                newTags,
                false
            )
        }
        notebookPanel.context.save();
    };

    toggleEditor() {
        this.setState({ showEditor: !this.state.showEditor });
    }

    getColor(name: string) {
        return ColorUtils.getColor(name);
    }

    render() {
        const previousBlockChoices = this.state.allBlocks.filter(
            (el) => !RESERVED_CELL_NAMES.includes(el) &&
                !(el === this.state.currentActiveCellMetadata.blockName)).map(name => ({ value: name, color: `#${this.getColor(name)}` }));


        const cellType = (RESERVED_CELL_NAMES.includes(this.state.currentActiveCellMetadata.blockName)) ?
            this.state.currentActiveCellMetadata.blockName : "step";

        const cellTypeHelperText = RESERVED_CELL_NAMES_HELP_TEXT[this.state.currentActiveCellMetadata.blockName] || null;

        const prevBlockNotice = (this.state.prevBlockName && this.state.currentActiveCellMetadata.blockName === '')
            ? "Leave step name empty to merge code to block " + this.state.prevBlockName
            : null;

        return (
            <React.Fragment>
                <div>
                    <div className={
                        this.state.wrapperClass
                        + (this.state.showEditor ? ' opened' : '')
                        + (cellType === 'step' ? ' kale-is-step' : '')
                    }>
                        <button className="kale-editor-toggle" onClick={() => this.toggleEditor()}>
                            {(this.state.showEditor ? <CloseIcon /> : <EditIcon />)}
                        </button>
                        <div
                            className={'kale-cell-metadata-editor' + (this.state.showEditor ? '' : ' hidden')}>
                            {/* style={{ border: `2px solid #${this.getColor(this.props.stepName)}` }} */}

                            <div>
                                <MaterialSelect
                                    updateValue={this.updateCurrentCellType}
                                    values={CELL_TYPES}
                                    value={cellType}
                                    label={"Cell type"}
                                    index={0}
                                    variant="standard"
                                    helperText={cellTypeHelperText}
                                />

                                {cellType === 'step' ? (
                                    <MaterialInput
                                        label={"Step name"}
                                        updateValue={this.updateCurrentBlockName}
                                        value={this.state.currentActiveCellMetadata.blockName}
                                        regex={"^([_a-z]([_a-z0-9]*)?)?$"}
                                        regexErrorMsg={"Step name must consist of lower case alphanumeric characters or '_', and can not start with a digit."}
                                        helperText={prevBlockNotice}
                                        variant="standard"
                                    />
                                ) : ''}
                            </div>

                            {cellType === 'step' ? (
                                <div>
                                    <MaterialSelectMulti
                                        updateSelected={this.updatePrevBlocksNames}
                                        options={previousBlockChoices}
                                        variant="standard"
                                        selected={this.state.currentActiveCellMetadata.prevBlockNames} />
                                </div>
                            ) : ''}

                        </div>
                    </div>
                </div>
            </React.Fragment>
        )
    }
}