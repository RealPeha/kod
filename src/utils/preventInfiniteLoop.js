const preventInfiniteLoop = (code, maxIteration = 1000) => {
    return code.replace(/for *\(.*\{|while *\(.*\{|do *\{/g, loopHead => {
        const id = parseInt(Math.random() * 1e4, 10)

        return `
            let index${id} = 0
            ${loopHead}
                if (++index${id} > ${maxIteration}) {
                    throw Error('you loh')
                }
        `
    })
}

export default preventInfiniteLoop
