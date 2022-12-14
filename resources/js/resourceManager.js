class ResourceManager {
    constructor() {
        this.rs = new RSUnits();
        this.rat = new RAT(32);
        this.scalerRAT = new RAT(32, RegType.Scaler)
        this.workloads = [];
        this.postBranchLoads = [];
        this.loopBodyloads = [];
        this.branchLoads = [];
    }

    getBranchRegisters() {

        var brInstruction = this.branchLoads[1];
        return [brInstruction.dest, brInstruction.srcFirst];
    }

    initializeRS(unitsSize) {
        this.rs.createRSUnits(unitsSize);
    }

    _extractLoopBody(instructions, brIndx) {

        let brIns = instructions[brIndx];
        let brStartIndx = parseInt(brIns.Src2);
        if (brStartIndx >= (brIndx - 1)) {
            console.log("No valid instruction selected for loop body");
            return;
        }

        for (let indx = brStartIndx - 1; indx <= brIndx - 2; ++indx) {
            this.loopBodyloads.push(this.workloads[indx]);
        }
    }

    // initializeWLoad(instructions, execCycles){
    //     if ((instructions == undefined) ||
    //         (instructions.length == 0)) {
    //             console.error("No instruction found to load");
    //             return undefined;
    //     }

    //     let branchFound = false;
    //     let indx = 0;
    //     for (indx = 0; indx < instructions.length; ++indx) {
    //         var color = getRandomColor(indx);
    //         let curInstruction = instructions[indx];
    //         let opName = getUniqueOPName(curInstruction.OP);

    //         let insCycle;
    //         if (getOPType(opName) != OPType.ld) {
    //             insCycle = execCycles[opName];
    //         } else {
    //             insCycle = execCycles["ld_miss"];
    //         }

    //         var newIns = new Instruction(curInstruction, insCycle, color, (indx + 1));
    //         if (getOPClass(opName) == "Branch") {
    //             this.branchLoads.push(this.workloads.pop());
    //             this.branchLoads.push(newIns);
    //             this._extractLoopBody(instructions,indx);
    //             branchFound=true;
    //             continue;
    //         }

    //         if(branchFound){
    //             this.postBranchLoads.push(newIns);
    //         }else{
    //             this.workloads.push(newIns);
    //         }
    //     }
    // }

    initializeWLoad(instructions, execCycles) {
        //find the level from instruction
        if ((instructions == undefined) ||
            (instructions.length == 0)) {
            console.error("No instruction found to load");
            return undefined;
        }

        let indx = 0;
        for (indx = 0; indx < instructions.length; ++indx) {
            var color = getRandomColor(indx);
            let curInstruction = instructions[indx];

            let opName = getUniqueOPName(curInstruction.OP);

            if (getOPClass(opName) == "Branch") {
                break;
            }

            let insCycle;
            if (getOPType(opName) != OPType.ld) {
                insCycle = execCycles[opName];
            } else {
                insCycle = execCycles["ld_miss"];
            }

            var newIns = new Instruction(curInstruction, insCycle, color, (indx + 1));
            this.workloads.push(newIns);
        }

        if (indx != instructions.length) {
            this.workloads.pop();
            this.loopBodyloads = _.cloneDeep(this.workloads); // loop body should collect from level to branch instruction
            --indx;
            let curInstruction = instructions[indx];
            let opName = getUniqueOPName(curInstruction.OP);
            if (getOPClass(opName) != "Integer") {
                console.error("Instruction should be integer");
                return;
            }

            var color = getRandomColor(indx);
            var newIns = new Instruction(curInstruction, 1, color, indx + 1);
            this.branchLoads.push(newIns);
            ++indx;

            color = getRandomColor(indx);
            curInstruction = instructions[indx];
            newIns = new Instruction(curInstruction, 1, color, indx + 1);
            this.branchLoads.push(newIns);
        }

        return 0;
    }

    findRAWDependency(instructions) {

        if (instructions == undefined) {
            return;
        }

        for (let indxI = instructions.length - 1; indxI >= 0; --indxI) {

            let curIns = instructions[indxI];
            curIns.rawDep = [];

            for (let indxJ = indxI - 1; (indxJ >= 0) &&
                (instructions[indxJ].OPType != OPType.sd); --indxJ) {
                let prevIns = instructions[indxJ];

                if ((curIns.getFirstOperand() == prevIns.getDestOperand()) ||
                    (curIns.getSecOperand() == prevIns.getDestOperand())
                ) {
                    curIns.rawDep.push(prevIns.getID());
                }
            }
        }
    }

    depInsIssued(wload) {
        var completed = true;
        wload.rawDep.forEach(insId => {
            let depLoad = this.getWLoadByID(insId);
            if (depLoad.getStateType() < StateType.Issue) {
                completed = false;
            }
        });

        return completed;
    }

    hasLoopInstruction() {
        if (this.loopBodyloads.length != 0) {
            return true;
        }
        return false;
    }

    updateLoopCountInstruction() {
        var loopCounterIns = this.branchLoads[0];

        var src1 = loopCounterIns.getFirstOperand();
        var src1Value = parseInt(this.scalerRAT.getRATContent(src1));

        if (!isNumber(src1Value)) {
            src1Value = 0;
        }

        var src2Value = parseInt(loopCounterIns.getSecOperand());
        if (!isNumber(src2Value)) {
            src2Value = 0;
        }
        var ratValue = src1Value + src2Value;

        if (ratValue < 0) {
            console.log("increment or decrement operator value is negative");
        }
        this.scalerRAT.updateScalerRat(src1, ratValue);

    }

    isConditionTrue() {
        let brSrc1 = this.branchLoads[1].getFirstOperand();
        let brSrc2 = this.branchLoads[1].getDestOperand();

        let brSrc1Value = parseInt(this.scalerRAT.getRATContent(brSrc1));
        let brSrc2Value = parseInt(this.scalerRAT.getRATContent(brSrc2));

        if (isNaN(brSrc1Value) || isNaN(brSrc2Value)) {
            return false;
        }
        let brOPType = this.branchLoads[1].getType();

        switch (brOPType) {
            case OPType.beqz:
                return brSrc1Value == 0;
            case OPType.bneq:
                return brSrc1Value != brSrc2Value;
            case OPType.bnez:
                return brSrc1Value != 0;
            default:
                break;
        }
    }

    expandWorkLoad(execCycles) {

        if (!this.isConditionTrue()) {
            return;
        }
        var branchIns = this.branchLoads[1];
        var loopCounterIns = this.branchLoads[0];

        var src1 = loopCounterIns.getFirstOperand();

        var branchRegSrc1 = branchIns.getDestOperand();
        var branchRegSrc2 = branchIns.getFirstOperand();
        var level = branchIns.getSecOperand();

        var branchRegValue = 0;
        if (src1 == branchRegSrc1) {
            branchRegValue = parseInt(this.scalerRAT.getRATContent(branchRegSrc2));
        }
        else if (src1 == branchRegSrc2) {
            branchRegValue = parseInt(this.scalerRAT.getRATContent(branchRegSrc1));
        }
        var expandFlag = false;
        if (branchIns.type == OPType.bneq) {
            expandFlag = true;
        }

        var tempWorkLoad = _.cloneDeep(this.loopBodyloads);
        var instructionLen = this.workloads.length;
        if (expandFlag) {
            for (let indx = 0; indx < tempWorkLoad.length; ++indx) {
                let rawIns = {
                    OP: tempWorkLoad[indx].getOperator(),
                    Dest: tempWorkLoad[indx].getDestOperand(),
                    Src1: tempWorkLoad[indx].getFirstOperand(),
                    Src2: tempWorkLoad[indx].getSecOperand()
                };

                let insCycle;
                if (tempWorkLoad[indx].getType() != OPType.ld) {
                    insCycle = tempWorkLoad[indx].getCycle(INSCycles.ExecCycle);
                } else {
                    insCycle = execCycles["ld_hit"];
                }

                let newInsLen = indx + instructionLen + 1;
                let color = getRandomColor(newInsLen);
                var newInstruction = new Instruction(rawIns, insCycle, color, newInsLen, tempWorkLoad[indx].getID());
                this.workloads.push(newInstruction);
            }
        }
        this.findRAWDependency(this.workloads);
    }

    reinitializeWLoad() {
        var tempWLoad = [];
        var wLoad = this.workloads;

        if (this.loopBodyloads.length != 0) {
            this.workloads = _.cloneDeep(this.loopBodyloads);
            return;
        }

        wLoad.forEach(function (insLoad, indx) {
            let ins = {
                "OP": insLoad.getOperator(),
                "Dest": insLoad.getDestOperand(),
                "Src1": insLoad.getFirstOperand(),
                "Src2": insLoad.getSecOperand()
            }

            var newIns = new Instruction(ins, insLoad.exeCycle, insLoad.color, indx + 1);
            tempWLoad.push(newIns);
        });

        this.workloads = tempWLoad;
    }

    initializeResource(instructions, insCycles, unitsSize) {
        this.initializeRS(unitsSize);
        this.initializeWLoad(instructions, insCycles, unitsSize);
        this.findRAWDependency(this.workloads);

    }

    reInitializeResource() {
        this.rat = new RAT(15);
        this.scalerRAT.setInitialRegValue();
        this.rs.resetRSUnits();
        this.reinitializeWLoad();
        this.findRAWDependency(this.workLoads);
    }

    getWLoads() {
        return this.workloads;
    }

    getLoopBody() {
        return this.loopBodyloads;
    }

    getWLoadByID(id) {
        let indx = 0;
        var wLoad = [];
        for (; indx < this.workloads.length; ++indx) {
            if (id == this.workloads[indx].id) {
                wLoad = this.workloads[indx];
                break;
            }
        }

        return wLoad;
    }

    getRAT(type = RegType.Float) {
        if (type == RegType.Float) {
            return this.rat;
        } else if (type == RegType.Scaler) {
            return this.scalerRAT;
        }
    }

    getRSUnits(rsType) {
        var rsUnit = this.rs.getRSUnits(rsType);
        if (rsUnit != undefined) {
            return rsUnit;
        }
        else {
            return this.rs;
        }
    }

    hasInstruction(optypes) {
        let ret = false;
        var wloads = this.getWLoads();
        for (let indx = 0; indx < wloads.length; ++indx) {
            optypes.forEach(opType => {
                if (opType == wloads[indx].type) {
                    ret = true;
                    return;
                }
            });

            if (ret == true) {
                break;
            }
        }

        return ret;
    }

}